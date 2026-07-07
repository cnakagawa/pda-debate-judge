import { prisma } from "@/src/lib/db";
import { requireUser, ApiError } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";
import { assertTransition, getOwnedAssessment } from "@/src/services/assessmentService";

/** LO: PMスピーチ再生開始（preparing → listening） */
export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const a = await getOwnedAssessment(user.id, id);
    if (a.role !== "LO") throw new ApiError(400, "not_lo", "LOアセスメントではありません");
    assertTransition(a.status, "listening");
    const updated = await prisma.assessment.update({
      where: { id },
      data: { status: "listening" },
    });
    return ok({ status: updated.status });
  },
);
