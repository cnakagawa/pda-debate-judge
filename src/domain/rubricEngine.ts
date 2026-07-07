import type {
  Band,
  Category,
  CategoryResult,
  CriterionDef,
  CriterionJudgment,
  GateJudgment,
  Grade,
  ItemDef,
  ItemResult,
  RubricDefinition,
  ScoreResult,
  ScoringContext,
} from "./types";
import { pdLevelFor, cefrReferenceFor, type PdLevelGrid } from "./pdLevel";

/**
 * RubricEngine — ルーブリック「補足」列の点数決定規則の決定的な実装。
 *
 * 入力は「詳細項目の充足判定（true/false）」と「低得点ゲート判定」のみ。
 * AI・管理者のどちらが判定した場合でも、点数はこの関数だけが計算する。
 *
 * 点数規則（内容・表現それぞれ 0〜10点）:
 *   - ゲート該当: 0 / 1 / 2 点で確定
 *   - B帯: B充足項目数 1〜2 → 3点、3 → 4点、4 → 5点
 *   - A帯: 4項目すべてのA基準を満たす → 6点
 *   - S帯: 6点を満たした上で「特に評価できる項目」（S詳細項目の半分以上を充足した項目）の数
 *          1 → 7点、2 → 8点、3 → 9点、4 → 10点
 */

export interface RubricEngineInput {
  rubric: RubricDefinition;
  context: ScoringContext;
  judgments: CriterionJudgment[];
  gates: GateJudgment[];
}

/** A criterion is excluded from scoring when POIs cannot occur and it presupposes them. */
export function isCriterionExcluded(
  criterion: CriterionDef,
  context: ScoringContext,
): boolean {
  if (context.poiAvailable) return false;
  return (
    criterion.applicability === "poi_available" ||
    criterion.applicability === "poi_available_exception"
  );
}

function judgmentMap(judgments: CriterionJudgment[]): Map<string, CriterionJudgment> {
  const map = new Map<string, CriterionJudgment>();
  for (const j of judgments) map.set(j.criterionId, j);
  return map;
}

function bandCriteria(item: ItemDef, band: Band): CriterionDef[] {
  return item.criteria.filter((c) => c.band === band);
}

function scoreItem(
  item: ItemDef,
  judgments: Map<string, CriterionJudgment>,
  context: ScoringContext,
): ItemResult {
  const results: ItemResult["criteria"] = item.criteria.map((c) => {
    const excluded = isCriterionExcluded(c, context);
    const j = judgments.get(c.id);
    return {
      criterionId: c.id,
      band: c.band,
      text: c.replyText && context.speechType === "reply" ? c.replyText : c.text,
      excluded,
      met: excluded ? false : (j?.met ?? false),
      confidence: j?.confidence,
      rationale: excluded
        ? "1人受験のためPOIは発生せず、判定対象外（受験者に不利にならない扱い）"
        : j?.rationale,
      evidence: j?.evidence,
      source: j?.source ?? "llm",
    };
  });

  const applicable = (band: Band) =>
    results.filter((r) => r.band === band && !r.excluded);

  // B・A帯は該当バンドの（除外後の）全詳細項目の充足が必要。
  const bCriteria = applicable("B");
  const aCriteria = applicable("A");
  const bMet = bCriteria.length > 0 && bCriteria.every((r) => r.met);
  const aMet = aCriteria.length > 0 && aCriteria.every((r) => r.met);

  // S帯: 「特に評価できる」= 除外後のS詳細項目の半分以上を充足。
  const sCriteria = applicable("S");
  const sMetCount = sCriteria.filter((r) => r.met).length;
  const sApplicableCount = sCriteria.length;
  const especiallyCommendable =
    sApplicableCount > 0 && sMetCount * 2 >= sApplicableCount && aMet && bMet;

  let grade: Grade;
  if (especiallyCommendable) grade = "S";
  else if (bMet && aMet) grade = "A";
  else if (bMet) grade = "B";
  else grade = "C";

  return {
    key: item.key,
    category: item.category,
    grade,
    bMet,
    aMet,
    sMetCount,
    sApplicableCount,
    especiallyCommendable,
    criteria: results,
  };
}

export function categoryGradeForScore(score: number): Grade {
  if (score >= 7) return "S";
  if (score === 6) return "A";
  if (score >= 3) return "B";
  return "C";
}

function scoreCategory(
  category: Category,
  rubric: RubricDefinition,
  judgments: Map<string, CriterionJudgment>,
  gates: GateJudgment[],
  context: ScoringContext,
): CategoryResult {
  const items = rubric.items
    .filter((i) => i.category === category)
    .map((i) => scoreItem(i, judgments, context));

  const gateDefs = category === "matter" ? rubric.matterGates : rubric.mannerGates;
  const gateJudgment = gates.find((g) => g.category === category && g.gateId !== null);
  const gateDef = gateJudgment
    ? gateDefs.find((g) => g.id === gateJudgment.gateId)
    : undefined;

  if (gateDef) {
    return {
      category,
      score: gateDef.score,
      grade: "C",
      band: "gate",
      gate: { score: gateDef.score, gateId: gateDef.id },
      // ゲート該当時は全項目C（発話がほぼ無い状態のため個別判定は成立しない）。
      items: items.map((i) => ({ ...i, grade: "C" as Grade })),
    };
  }

  const bCount = items.filter((i) => i.bMet).length;
  const aAll = items.every((i) => i.aMet && i.bMet);

  let score: number;
  let band: CategoryResult["band"];

  if (bCount === 0) {
    // ゲート非該当だがB基準を1項目も満たさない場合は、ルーブリック上の
    // 「論点を提示するにとどまる」状態（2点）と同等に扱う。
    score = 2;
    band = "B";
  } else if (!aAll) {
    score = bCount <= 2 ? 3 : bCount === 3 ? 4 : 5;
    band = "B";
  } else {
    const commendable = items.filter((i) => i.especiallyCommendable).length;
    score = 6 + commendable; // 0→6, 1→7, 2→8, 3→9, 4→10
    band = commendable > 0 ? "S" : "A";
  }

  return {
    category,
    score,
    grade: categoryGradeForScore(score),
    band,
    gate: null,
    items,
  };
}

export function computeScore(
  input: RubricEngineInput,
  pdLevelGrid?: PdLevelGrid,
): ScoreResult {
  const judgments = judgmentMap(input.judgments);
  const matter = scoreCategory("matter", input.rubric, judgments, input.gates, input.context);
  const manner = scoreCategory("manner", input.rubric, judgments, input.gates, input.context);
  const pdLevel = pdLevelFor(matter.score, manner.score, pdLevelGrid);
  return {
    rubricVersion: input.rubric.version,
    matter,
    manner,
    total: matter.score + manner.score,
    pdLevel,
    cefrReference: cefrReferenceFor(pdLevel),
  };
}
