import { z } from "zod";
import { prisma } from "@/src/lib/db";
import { requireAdmin, ApiError } from "@/src/lib/session";
import { handler, ok, parseBody, auditLog } from "@/src/lib/api";
import { judgmentsFromItems, persistEvaluation } from "@/src/services/evaluationService";
import type { RubricDefinition, ScoringContext, GateJudgment } from "@/src/domain/types";
import type { PdLevelGrid } from "@/src/domain/pdLevel";
import { getPdLevelGrid } from "@/src/lib/settings";

const schema = z.object({
  criteriaOverrides: z
    .array(z.object({ criterionId: z.string(), met: z.boolean() }))
    .default([]),
  gateOverrides: z
    .array(
      z.object({
        category: z.enum(["matter", "manner"]),
        gateId: z.string().nullable(),
      }),
    )
    .optional(),
  comments: z
    .object({
      goodPoints: z.string().min(1),
      improvementPoints: z.string().min(1),
      overallComments: z.string().min(1),
    })
    .optional(),
  reason: z.string().min(1, "修正理由は必須です"),
});

/**
 * 管理者による評価修正。
 * 詳細項目の充足（true/false）を変更 → RubricEngine が点数・グレード・PD Level を再計算。
 * 点数の直接入力は受け付けない（ルーブリック整合性の構造的保証）。
 * 修正は新しい evaluation 世代として保存され、監査ログが残る。
 */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await parseBody(req, schema);

    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: { items: true, rubricVersion: true, assessment: true },
    });
    if (!evaluation) throw new ApiError(404, "not_found", "評価が見つかりません");
    if (!evaluation.isCurrent) {
      throw new ApiError(409, "not_current", "最新の評価のみ修正できます");
    }

    const rubric = evaluation.rubricVersion.definition as unknown as RubricDefinition;
    const roleSpec = await prisma.roleSpecRecord.findUniqueOrThrow({
      where: { role: evaluation.assessment.role },
    });
    const context: ScoringContext = {
      speechType: roleSpec.speechType,
      poiAvailable: false,
    };

    // 既存判定を復元し、上書きを適用
    const judgments = judgmentsFromItems(evaluation.items);
    const overrides = body.criteriaOverrides ?? [];
    const overrideMap = new Map(overrides.map((o) => [o.criterionId, o.met]));
    const merged = judgments.map((j) =>
      overrideMap.has(j.criterionId)
        ? {
            ...j,
            met: overrideMap.get(j.criterionId)!,
            source: "admin" as const,
            rationale: `管理者修正（元: ${j.met ? "充足" : "未充足"}）: ${body.reason}`,
          }
        : j,
    );

    const gates: GateJudgment[] =
      body.gateOverrides ?? (evaluation.gates as unknown as GateJudgment[]);

    const itemRationales: Record<string, string> = {};
    for (const item of evaluation.items) itemRationales[item.itemKey] = item.rationale;

    const pdGrid = (await getPdLevelGrid()) as PdLevelGrid;
    const { evaluationId: newId, score } = await persistEvaluation(prisma, {
      assessmentId: evaluation.assessmentId,
      rubricVersionId: evaluation.rubricVersionId,
      rubric,
      context,
      judgments: merged,
      gates,
      pdLevelGrid: pdGrid,
      source: "admin_edit",
      itemRationales,
      structure: evaluation.structure,
      llmModel: evaluation.llmModel ?? undefined,
      promptVersion: evaluation.promptVersion ?? undefined,
      createdById: admin.id,
      supersedesId: evaluation.id,
      comments: body.comments ?? {
        goodPoints: evaluation.goodPoints,
        improvementPoints: evaluation.improvementPoints,
        overallComments: evaluation.overallComments,
      },
    });

    await prisma.evaluationRevision.create({
      data: {
        evaluationId: newId,
        editorId: admin.id,
        reason: body.reason,
        diff: {
          criteriaOverrides: overrides,
          gateOverrides: body.gateOverrides ?? null,
          commentsChanged: !!body.comments,
          before: {
            matterScore: evaluation.matterScore,
            mannerScore: evaluation.mannerScore,
            totalScore: evaluation.totalScore,
            pdLevel: evaluation.pdLevel,
          },
          after: {
            matterScore: score.matter.score,
            mannerScore: score.manner.score,
            totalScore: score.total,
            pdLevel: score.pdLevel,
          },
        },
      },
    });
    await auditLog(admin.id, "evaluation.revise", "evaluation", newId, {
      supersedes: evaluation.id,
      reason: body.reason,
    });

    return ok({
      evaluationId: newId,
      matterScore: score.matter.score,
      mannerScore: score.manner.score,
      totalScore: score.total,
      matterGrade: score.matter.grade,
      mannerGrade: score.manner.grade,
      pdLevel: score.pdLevel,
    });
  },
);
