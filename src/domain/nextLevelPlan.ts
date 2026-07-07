import type { Band, Category, ItemKey, RubricDefinition, ScoreResult, ScoringContext } from "./types";
import type { PdLevel } from "./pdLevel";
import { isCriterionExcluded } from "./rubricEngine";

/**
 * NextLevelPlan — 次のPDレベルに上がるための練習プランを決定的に導出する。
 *
 * ・目標レベルはPDA提供マトリクスのラダー（PD5→PD4→PD3→PD2→PD1、PD1が最上位）から逆算。
 * ・「練習すべきこと」はすべてルーブリック詳細項目の原文。AI独自の練習基準は作らない。
 * ・POI等、当該受験形式で判定対象外の項目は推奨に含めない。
 */

/** レベル到達条件のラダー（PD6は入口領域のため目標としては扱わない） */
const LADDER: Array<{ level: PdLevel; matter: number; manner: number }> = [
  { level: "PD5", matter: 3, manner: 3 },
  { level: "PD4", matter: 5, manner: 5 },
  { level: "PD3", matter: 6, manner: 6 },
  { level: "PD2", matter: 7, manner: 7 },
  { level: "PD1", matter: 9, manner: 9 },
];

export interface PlanRecommendation {
  category: Category;
  itemKey: ItemKey;
  itemLabelJa: string;
  band: Band;
  criterionId: string;
  /** ルーブリック原文（Reply時は［ ］内文言） */
  text: string;
  /** この項目を満たすと何が起きるか（帯域規則に基づく説明） */
  effect: string;
}

export interface NextLevelPlan {
  currentLevel: PdLevel | null;
  /** null = すでに最上位（PD1）に到達 */
  targetLevel: PdLevel | null;
  requirements: { matter: number; manner: number } | null;
  gaps: { matter: number; manner: number };
  recommendations: PlanRecommendation[];
}

export function buildNextLevelPlan(
  score: ScoreResult,
  rubric: RubricDefinition,
  context: ScoringContext,
  currentLevel: PdLevel | null,
): NextLevelPlan {
  const m = score.matter.score;
  const e = score.manner.score;

  const target = LADDER.find((l) => !(m >= l.matter && e >= l.manner)) ?? null;
  if (!target) {
    return {
      currentLevel,
      targetLevel: null,
      requirements: null,
      gaps: { matter: 0, manner: 0 },
      recommendations: [],
    };
  }

  const gaps = {
    matter: Math.max(0, target.matter - m),
    manner: Math.max(0, target.manner - e),
  };

  const recommendations: PlanRecommendation[] = [];
  for (const category of ["matter", "manner"] as const) {
    const gap = category === "matter" ? gaps.matter : gaps.manner;
    if (gap <= 0) continue;
    const required = category === "matter" ? target.matter : target.manner;
    recommendations.push(...categoryPath(score, rubric, context, category, required));
  }

  return { currentLevel, targetLevel: target.level, requirements: { matter: target.matter, manner: target.manner }, gaps, recommendations };
}

/** カテゴリの現在点から目標点への「最短経路」上の未充足詳細項目を列挙する */
function categoryPath(
  score: ScoreResult,
  rubric: RubricDefinition,
  context: ScoringContext,
  category: Category,
  required: number,
): PlanRecommendation[] {
  const catResult = category === "matter" ? score.matter : score.manner;
  const out: PlanRecommendation[] = [];

  const rubricItems = rubric.items.filter((i) => i.category === category);
  const labelOf = (key: ItemKey) => rubricItems.find((i) => i.key === key)?.labelJa ?? key;

  const unmetCriteria = (band: Band, itemKeys?: ItemKey[]) => {
    const rows: PlanRecommendation[] = [];
    for (const item of catResult.items) {
      if (itemKeys && !itemKeys.includes(item.key)) continue;
      for (const c of item.criteria) {
        if (c.band !== band || c.met || c.excluded) continue;
        const def = rubricItems.flatMap((i) => i.criteria).find((d) => d.id === c.criterionId);
        if (!def || isCriterionExcluded(def, context)) continue;
        rows.push({
          category,
          itemKey: item.key,
          itemLabelJa: labelOf(item.key),
          band,
          criterionId: c.criterionId,
          text: c.text,
          effect:
            band === "B"
              ? "B基準の充足項目を増やす（1〜2項目で3点、3項目で4点、4項目で5点）"
              : band === "A"
                ? "4項目すべてのA基準を満たすと6点（Aグレード）"
                : "S詳細項目の半分以上を満たすと「特に評価できる」項目となり+1点",
        });
      }
    }
    return rows;
  };

  // 目標点までの帯域規則に沿って必要な項目を積む
  if (required <= 5) {
    out.push(...unmetCriteria("B"));
  } else if (required === 6) {
    out.push(...unmetCriteria("B"), ...unmetCriteria("A"));
  } else {
    out.push(...unmetCriteria("B"), ...unmetCriteria("A"));
    // 7点以上: 「特に評価できる」項目が (required - 6) 個必要。
    // 追加で必要な項目数のぶんだけ、到達に必要な充足数が少ない項目を優先して提示する。
    const currentCommendable = catResult.items.filter((i) => i.especiallyCommendable).length;
    const neededAdditional = Math.max(required - 6 - currentCommendable, 0);
    const candidates = catResult.items
      .filter((i) => !i.especiallyCommendable && i.sApplicableCount > 0)
      .map((i) => ({
        key: i.key,
        deficit: Math.ceil(i.sApplicableCount / 2) - i.sMetCount,
      }))
      .sort((a, b) => a.deficit - b.deficit)
      .slice(0, neededAdditional);
    out.push(...unmetCriteria("S", candidates.map((c) => c.key)));
  }

  return out;
}
