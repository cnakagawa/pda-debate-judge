import { prisma } from "@/src/lib/db";
import { requireUser } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";
import { assertTransition, getOwnedAssessment } from "@/src/services/assessmentService";
import { enqueueScoring } from "@/src/pipeline/queue";

/** アップロード完了 → 採点パイプライン投入 */
export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const a = await getOwnedAssessment(user.id, id);
    assertTransition(a.status, "processing");
    await prisma.assessment.update({ where: { id }, data: { status: "processing" } });
    await enqueueScoring(id);
    return ok({ status: "processing" });
  },
);
