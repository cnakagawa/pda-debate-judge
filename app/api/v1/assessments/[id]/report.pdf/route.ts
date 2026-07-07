import { prisma } from "@/src/lib/db";
import { requireUser, ApiError } from "@/src/lib/session";
import { handler } from "@/src/lib/api";
import { getOwnedAssessment } from "@/src/services/assessmentService";
import { makeStorage } from "@/src/adapters/providers";

export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await getOwnedAssessment(user.id, id);
    const report = await prisma.report.findFirst({
      where: { assessmentId: id, evaluation: { isCurrent: true } },
      orderBy: { issuedAt: "desc" },
    });
    if (!report) throw new ApiError(404, "no_report", "レポートがまだ発行されていません");
    const pdf = await makeStorage().get(report.storageKey);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pd-assessment-report-${id.slice(0, 8)}.pdf"`,
      },
    });
  },
);
