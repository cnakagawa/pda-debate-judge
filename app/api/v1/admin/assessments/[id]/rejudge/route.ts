import { prisma } from "@/src/lib/db";
import { requireAdmin, ApiError } from "@/src/lib/session";
import { handler, ok, auditLog } from "@/src/lib/api";
import { enqueueScoring } from "@/src/pipeline/queue";

/**
 * AI再採点（プロンプト・モデル更新後の再実行、または失敗ジョブの再試行）。
 * 既存評価は世代として保持され、新しいAI評価が current になる。
 * 文字起こし・計測値・フレーム所見はDBに保存済みのため、録画削除後でも再採点できる。
 */
export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const a = await prisma.assessment.findUnique({ where: { id } });
    if (!a) throw new ApiError(404, "not_found", "アセスメントが見つかりません");
    if (!["scored", "failed"].includes(a.status)) {
      throw new ApiError(409, "invalid_state", "採点完了または失敗状態のみ再採点できます");
    }

    // 現行評価を退役させる（judge ステップが新しい評価を生成する）
    await prisma.evaluation.updateMany({
      where: { assessmentId: id, isCurrent: true },
      data: { isCurrent: false },
    });
    await prisma.assessment.update({
      where: { id },
      data: { status: "processing", completedAt: null },
    });
    await enqueueScoring(id);
    await auditLog(admin.id, "assessment.rejudge", "assessment", id);
    return ok({ status: "processing" });
  },
);
