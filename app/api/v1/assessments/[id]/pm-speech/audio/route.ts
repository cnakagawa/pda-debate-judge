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
    const speech = await prisma.generatedSpeech.findUnique({
      where: { assessmentId_role: { assessmentId: id, role: "PM" } },
    });
    if (!speech?.audioStorageKey) {
      throw new ApiError(404, "not_ready", "PMスピーチ音声がまだ準備できていません");
    }
    const audio = await makeStorage().get(speech.audioStorageKey);
    const mime = speech.audioStorageKey.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(audio.length),
        "Cache-Control": "private, no-store",
      },
    });
  },
);
