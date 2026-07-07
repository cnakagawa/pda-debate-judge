import { prisma } from "@/src/lib/db";
import { requireUser } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";
import { assertTransition, getOwnedAssessment } from "@/src/services/assessmentService";
import { enqueuePmSpeechGeneration } from "@/src/pipeline/queue";

export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const a = await getOwnedAssessment(user.id, id);
    assertTransition(a.status, "preparing");
    const updated = await prisma.assessment.update({
      where: { id },
      data: { status: "preparing", prepStartedAt: new Date() },
    });
    // LOの場合はPMスピーチ生成を準備時間中にバックグラウンドで進める
    if (a.role === "LO") {
      await enqueuePmSpeechGeneration(id);
    }
    return ok({ status: updated.status, prepStartedAt: updated.prepStartedAt });
  },
);
