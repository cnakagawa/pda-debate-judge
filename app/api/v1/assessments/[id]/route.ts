import { requireUser } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";
import { getOwnedAssessment } from "@/src/services/assessmentService";

export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const a = await getOwnedAssessment(user.id, id);
    return ok({
      id: a.id,
      role: a.role,
      motion: a.motion.textEn,
      status: a.status,
      statusDetail: a.statusDetail,
      prepStartedAt: a.prepStartedAt,
      recordingStartedAt: a.recordingStartedAt,
    });
  },
);
