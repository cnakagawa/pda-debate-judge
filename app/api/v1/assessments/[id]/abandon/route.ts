import { prisma } from "@/src/lib/db";
import { requireUser, ApiError } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";
import { getOwnedAssessment } from "@/src/services/assessmentService";

export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const a = await getOwnedAssessment(user.id, id);
    if (["scored", "processing"].includes(a.status)) {
      throw new ApiError(409, "invalid_state", "この状態では中断できません");
    }
    await prisma.assessment.update({ where: { id }, data: { status: "abandoned" } });
    return ok({ status: "abandoned" });
  },
);
