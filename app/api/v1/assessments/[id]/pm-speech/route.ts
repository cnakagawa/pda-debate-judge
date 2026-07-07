import { prisma } from "@/src/lib/db";
import { requireUser, ApiError } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";
import { getOwnedAssessment } from "@/src/services/assessmentService";
import { enqueuePmSpeechGeneration } from "@/src/pipeline/queue";

/**
 * LO受験用のPMスピーチ取得。準備開始時にバックグラウンド生成しているため、
 * ここでは完成を待つ（ポーリングはクライアント側）。
 * スクリプト本文は返さない（聴解も含めた実戦形式のため）。
 */
export const POST = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const a = await getOwnedAssessment(user.id, id);
    if (a.role !== "LO") throw new ApiError(400, "not_lo", "LOアセスメントではありません");

    const speech = await prisma.generatedSpeech.findUnique({
      where: { assessmentId_role: { assessmentId: id, role: "PM" } },
    });
    if (!speech) {
      await enqueuePmSpeechGeneration(id);
      return ok({ ready: false });
    }
    if (!speech.audioStorageKey) return ok({ ready: false });
    return ok({
      ready: true,
      audioUrl: `/api/v1/assessments/${id}/pm-speech/audio`,
      durationSec: speech.durationSec,
    });
  },
);
