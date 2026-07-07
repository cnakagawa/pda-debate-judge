import { prisma } from "@/src/lib/db";
import { requireAdmin, ApiError } from "@/src/lib/session";
import { handler, ok, auditLog } from "@/src/lib/api";
import { issueReportPdf } from "@/src/services/reportService";

/** 指定した評価世代でPDFを再発行する */
export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ evaluationId: string }> }) => {
    const admin = await requireAdmin();
    const { evaluationId } = await ctx.params;
    const evaluation = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
    if (!evaluation) throw new ApiError(404, "not_found", "評価が見つかりません");
    const { reportId } = await issueReportPdf(
      prisma,
      evaluation.assessmentId,
      evaluationId,
      admin.id,
    );
    await auditLog(admin.id, "report.reissue", "report", reportId, { evaluationId });
    return ok({ reportId });
  },
);
