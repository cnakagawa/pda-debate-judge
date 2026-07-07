import type { Prisma, PrismaClient } from "@prisma/client";
import { computeScore } from "../domain/rubricEngine";
import type {
  CriterionJudgment,
  GateJudgment,
  RubricDefinition,
  ScoreResult,
  ScoringContext,
} from "../domain/types";
import type { PdLevelGrid } from "../domain/pdLevel";

type Db = PrismaClient | Prisma.TransactionClient;

export interface PersistEvaluationInput {
  assessmentId: string;
  rubricVersionId: string;
  rubric: RubricDefinition;
  context: ScoringContext;
  judgments: CriterionJudgment[];
  gates: GateJudgment[];
  pdLevelGrid: PdLevelGrid;
  source: "ai" | "admin_edit";
  itemRationales: Record<string, string>;
  llmModel?: string;
  promptVersion?: string;
  createdById?: string;
  supersedesId?: string;
  comments?: { goodPoints: string; improvementPoints: string; overallComments: string };
}

/**
 * RubricEngine で点数を計算し、評価（evaluation + evaluation_items）を1世代分保存する。
 * 管理者修正時も必ずこの関数を通ることで「点数はエンジンだけが決める」ことを保証する。
 */
export async function persistEvaluation(
  db: Db,
  input: PersistEvaluationInput,
): Promise<{ evaluationId: string; score: ScoreResult }> {
  const score = computeScore(
    {
      rubric: input.rubric,
      context: input.context,
      judgments: input.judgments,
      gates: input.gates,
    },
    input.pdLevelGrid,
  );

  // 既存の現行評価を非現行化
  await db.evaluation.updateMany({
    where: { assessmentId: input.assessmentId, isCurrent: true },
    data: { isCurrent: false },
  });

  const evaluation = await db.evaluation.create({
    data: {
      assessmentId: input.assessmentId,
      rubricVersionId: input.rubricVersionId,
      source: input.source,
      supersedesId: input.supersedesId,
      isCurrent: true,
      matterScore: score.matter.score,
      mannerScore: score.manner.score,
      totalScore: score.total,
      matterGrade: score.matter.grade,
      mannerGrade: score.manner.grade,
      pdLevel: score.pdLevel,
      cefrReference: score.cefrReference,
      gates: input.gates as unknown as Prisma.InputJsonValue,
      goodPoints: input.comments?.goodPoints ?? "",
      improvementPoints: input.comments?.improvementPoints ?? "",
      overallComments: input.comments?.overallComments ?? "",
      llmModel: input.llmModel,
      promptVersion: input.promptVersion,
      createdById: input.createdById,
    },
  });

  const items = [...score.matter.items, ...score.manner.items];
  await db.evaluationItem.createMany({
    data: items.map((item) => ({
      evaluationId: evaluation.id,
      category: item.category,
      itemKey: item.key,
      grade: item.grade,
      criteriaResults: item.criteria as unknown as Prisma.InputJsonValue,
      rationale: input.itemRationales[item.key] ?? "",
    })),
  });

  return { evaluationId: evaluation.id, score };
}

/** evaluation_items の criteriaResults から判定一覧を復元する（管理者修正の起点） */
export function judgmentsFromItems(
  items: Array<{ criteriaResults: unknown }>,
): CriterionJudgment[] {
  const out: CriterionJudgment[] = [];
  for (const item of items) {
    const rows = item.criteriaResults as Array<
      CriterionJudgment & { excluded?: boolean; band?: string; text?: string; criterionId: string }
    >;
    for (const r of rows) {
      if (r.excluded) continue;
      out.push({
        criterionId: r.criterionId,
        met: r.met,
        confidence: r.confidence,
        rationale: r.rationale,
        evidence: r.evidence,
        source: r.source,
      });
    }
  }
  return out;
}
