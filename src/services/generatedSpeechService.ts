import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { makeJudge, makeStorage, makeTts } from "../adapters/providers";

/**
 * LO受験用のPMスピーチを生成しTTS音声化する。
 * スクリプトは監査対象として永続保存（音声のみcleanup対象）。
 */
export async function generatePmSpeechForAssessment(
  prisma: PrismaClient,
  assessmentId: string,
): Promise<void> {
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    include: { motion: true, generatedSpeeches: true },
  });

  if (assessment.generatedSpeeches.some((g) => g.role === "PM" && g.audioStorageKey)) {
    return; // 冪等
  }

  const existing = assessment.generatedSpeeches.find((g) => g.role === "PM");
  const judge = makeJudge();

  const speech =
    existing ??
    (await (async () => {
      const generated = await judge.generatePmSpeech({
        motion: assessment.motion.textEn,
        language: assessment.language,
      });
      return prisma.generatedSpeech.create({
        data: {
          assessmentId,
          role: "PM",
          script: generated.script,
          structure: generated.structure as unknown as Prisma.InputJsonValue,
          llmModel: generated.model,
          promptVersion: generated.promptVersion,
        },
      });
    })());

  const tts = await makeTts().synthesize(speech.script, { language: assessment.language });
  const ext = tts.mimeType === "audio/wav" ? "wav" : "mp3";
  const audioKey = `media/${assessmentId}/pm-speech.${ext}`;
  await makeStorage().put(audioKey, tts.audio, tts.mimeType);

  await prisma.generatedSpeech.update({
    where: { id: speech.id },
    data: { audioStorageKey: audioKey },
  });
  await prisma.mediaFile.create({
    data: {
      assessmentId,
      kind: "tts_audio",
      storageKey: audioKey,
      mimeType: tts.mimeType,
      sizeBytes: BigInt(tts.audio.length),
    },
  });
}
