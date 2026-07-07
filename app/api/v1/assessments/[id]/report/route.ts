import { prisma } from "@/src/lib/db";
import { requireUser, ApiError } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";
import { getOwnedAssessment } from "@/src/services/assessmentService";
import { buildReportData } from "@/src/services/reportService";

export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const a = await getOwnedAssessment(user.id, id);
    if (a.status !== "scored") {
      throw new ApiError(409, "not_scored", "採点がまだ完了していません");
    }
    const data = await buildReportData(prisma, id);
    return ok(data);
  },
);
