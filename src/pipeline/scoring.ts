import type { PrismaClient, Prisma } from "@prisma/client";
import { makeJudge, makeStorage, makeStt, makeVision } from "../adapters/providers";
import { extractAudio, extractFrames, loudnessStats, probeDuration } from "../adapters/ffmpeg";
import { computeDeliveryMetrics, computeEyeContactRatio } from "./metrics";
import { judgeMetricCriteria } from "../domain/metricCriteria";
import type {
  DeliveryMetrics,
  RoleSpec,
  RubricDefinition,
  ScoringContext,
  TimeLimits,
} from "../domain/types";
import type { PdLevelGrid } from "../domain/pdLevel";
import { persistEvaluation } from "../services/evaluationService";
import { issueReportPdf } from "../services/reportService";
import { getPdLevelGrid, getRetention } from "../lib/settings";
import type { FrameFinding, SttWord } from "../ports";

/**
 * 採点パイプライン。
 * ひとつのジョブとして実行し、各ステップの完了を assessments.status_detail に
 * チェックポイントとして記録する。リトライ時は成果物（DB行）が存在するステップを
 * スキップするため冪等。
 *
 * ステップ: extract → transcribe → metrics → vision → judge → comments → report → cleanup
 */

export type PipelineStep =
  | "extract"
  | "transcribe"
  | "metrics"
  | "vision"
  | "judge"
  | "comments"
  | "report"
  | "cleanup";

const STEPS: PipelineStep[] = [
  "extract",
  "transcribe",
  "metrics",
  "vision",
  "judge",
  "comments",
  "report",
  "cleanup",
];

async function setProgress(
  prisma: PrismaClient,
  assessmentId: string,
  step: PipelineStep | "done",
  error?: string,
) {
  const detail: Record<string, unknown> = { currentStep: step, steps: STEPS };
  if (error) detail.error = error;
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { statusDetail: detail as Prisma.InputJsonValue },
  });
}

export async function runScoringPipeline(
  prisma: PrismaClient,
  assessmentId: string,
): Promise<void> {
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    include: {
      motion: true,
      mediaFiles: true,
      transcript: true,
      deliveryMetrics: true,
      generatedSpeeches: true,
      evaluations: { where: { isCurrent: true }, include: { items: true } },
    },
  });

  if (assessment.status === "scored") return; // 冪等

  const storage = makeStorage();
  const roleSpecRow = await prisma.roleSpecRecord.findUniqueOrThrow({
    where: { role: assessment.role },
  });
  const roleSpec: RoleSpec = {
    role: roleSpecRow.role,
    side: roleSpecRow.side,
    speechType: roleSpecRow.speechType,
    labelJa: roleSpecRow.labelJa,
    timeLimits: roleSpecRow.timeLimits as unknown as TimeLimits,
    requiredElements: roleSpecRow.requiredElements as unknown as RoleSpec["requiredElements"],
    inputs: roleSpecRow.inputs as unknown as RoleSpec["inputs"],
    enabled: roleSpecRow.isEnabled,
  };

  const rubricRow = await prisma.rubricVersion.findFirstOrThrow({ where: { isActive: true } });
  const rubric = rubricRow.definition as unknown as RubricDefinition;
  const context: ScoringContext = {
    speechType: roleSpec.speechType,
    poiAvailable: false, // Web受験版は常に1人受験
  };

  // 再採点時は録画削除済みでもDB保存済みの成果物（文字起こし・計測値・フレーム所見）で続行できる
  const video = assessment.mediaFiles.find((m) => m.kind === "video" && !m.deletedAt) ?? null;

  try {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: "processing" },
    });

    // ── extract: 音声抽出 ─────────────────────────────
    await setProgress(prisma, assessmentId, "extract");
    let audioRow =
      assessment.mediaFiles.find((m) => m.kind === "audio_extracted" && !m.deletedAt) ?? null;
    const videoExt = video?.mimeType?.includes("mp4") ? "mp4" : "webm";
    let recordingDurationSec = video?.durationSec ?? 0;
    if (!audioRow && !assessment.transcript) {
      if (!video) {
        throw new Error(`No video media and no stored transcript for assessment ${assessmentId}`);
      }
      const videoBuf = await storage.get(video.storageKey);
      const audio = await extractAudio(videoBuf, videoExt);
      if (!recordingDurationSec) {
        recordingDurationSec = await probeDuration(videoBuf, videoExt);
        await prisma.mediaFile.update({
          where: { id: video.id },
          data: { durationSec: recordingDurationSec },
        });
      }
      const audioKey = `media/${assessmentId}/audio.wav`;
      await storage.put(audioKey, audio, "audio/wav");
      audioRow = await prisma.mediaFile.create({
        data: {
          assessmentId,
          kind: "audio_extracted",
          storageKey: audioKey,
          mimeType: "audio/wav",
          sizeBytes: BigInt(audio.length),
          retention: video.retention,
          durationSec: recordingDurationSec,
        },
      });
    } else {
      recordingDurationSec = audioRow?.durationSec ?? recordingDurationSec;
    }

    // ── transcribe: 文字起こし ────────────────────────
    await setProgress(prisma, assessmentId, "transcribe");
    let transcript = assessment.transcript;
    if (!transcript) {
      if (!audioRow) throw new Error(`No extracted audio for assessment ${assessmentId}`);
      const audio = await storage.get(audioRow.storageKey);
      const stt = await makeStt().transcribe(audio, {
        language: assessment.language,
        mimeType: "audio/wav",
      });
      transcript = await prisma.transcript.create({
        data: {
          assessmentId,
          text: stt.text,
          words: stt.words as unknown as Prisma.InputJsonValue,
          sttProvider: stt.provider,
          sttModel: stt.model,
          language: stt.language,
        },
      });
    }
    const words = transcript.words as unknown as SttWord[];

    // ── metrics: 計測値 ──────────────────────────────
    await setProgress(prisma, assessmentId, "metrics");
    let metricsRow = assessment.deliveryMetrics;
    if (!metricsRow) {
      const base = computeDeliveryMetrics(words, recordingDurationSec);
      const loudness = audioRow
        ? await loudnessStats(await storage.get(audioRow.storageKey), "wav")
        : { meanVolumeDb: null, maxVolumeDb: null };
      metricsRow = await prisma.deliveryMetricsRecord.create({
        data: {
          assessmentId,
          speechDurationSec: base.speechDurationSec,
          silenceRatio: base.silenceRatio,
          longestSilenceSec: base.longestSilenceSec,
          wordsPerMinute: base.wordsPerMinute,
          loudnessStats: loudness as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // ── vision: 映像フレーム解析（削除前に必ず実施） ────
    await setProgress(prisma, assessmentId, "vision");
    let frameFindings = metricsRow.frameFindings as unknown as FrameFinding[];
    if ((!frameFindings || frameFindings.length === 0) && video) {
      const videoBuf = await storage.get(video.storageKey);
      const frames = await extractFrames(videoBuf, videoExt);
      frameFindings = await makeVision().analyzeFrames(frames);
      const eyeContactRatio = computeEyeContactRatio(frameFindings);
      metricsRow = await prisma.deliveryMetricsRecord.update({
        where: { id: metricsRow.id },
        data: {
          frameFindings: frameFindings as unknown as Prisma.InputJsonValue,
          framesAnalyzed: frames.length,
          eyeContactRatio,
        },
      });
    }
    frameFindings = frameFindings ?? [];

    const metrics: DeliveryMetrics = {
      speechDurationSec: metricsRow.speechDurationSec,
      silenceRatio: metricsRow.silenceRatio,
      longestSilenceSec: metricsRow.longestSilenceSec,
      wordsPerMinute: metricsRow.wordsPerMinute,
      eyeContactRatio: metricsRow.eyeContactRatio,
      framesAnalyzed: metricsRow.framesAnalyzed,
    };

    // ── judge: LLM判定 + RubricEngine採点 ─────────────
    await setProgress(prisma, assessmentId, "judge");
    const judge = makeJudge();
    let evaluation = assessment.evaluations[0];
    let evaluationId = evaluation?.id;
    if (!evaluationId) {
      const judgeOut = await judge.judgeSpeech({
        rubric,
        roleSpec,
        context,
        motion: assessment.motion.textEn,
        language: assessment.language,
        transcript: transcript.text,
        words,
        metrics,
        frameFindings,
        priorSpeeches: assessment.generatedSpeeches.map((g) => ({
          role: g.role,
          script: g.script,
        })),
      });
      const metricJudgments = judgeMetricCriteria(rubric, metrics, roleSpec.timeLimits);
      const pdGrid = (await getPdLevelGrid()) as PdLevelGrid;
      const { evaluationId: newId } = await persistEvaluation(prisma, {
        assessmentId,
        rubricVersionId: rubricRow.id,
        rubric,
        context,
        judgments: [...judgeOut.judgments, ...metricJudgments],
        gates: judgeOut.gates,
        pdLevelGrid: pdGrid,
        source: "ai",
        itemRationales: judgeOut.itemRationales,
        llmModel: judgeOut.model,
        promptVersion: judgeOut.promptVersion,
      });
      evaluationId = newId;
    }

    // ── comments: コメント生成 ────────────────────────
    await setProgress(prisma, assessmentId, "comments");
    const evalRow = await prisma.evaluation.findUniqueOrThrow({
      where: { id: evaluationId },
      include: { items: true },
    });
    if (!evalRow.goodPoints) {
      const itemSummaries = evalRow.items.map((item) => {
        const rows = item.criteriaResults as unknown as Array<{
          met: boolean;
          text: string;
          excluded: boolean;
        }>;
        return {
          itemKey: item.itemKey,
          labelJa: rubric.items.find((i) => i.key === item.itemKey)?.labelJa ?? item.itemKey,
          category: item.category as "matter" | "manner",
          grade: item.grade,
          metCriteria: rows.filter((r) => r.met && !r.excluded).map((r) => r.text),
          unmetCriteria: rows.filter((r) => !r.met && !r.excluded).map((r) => r.text),
        };
      });
      const comments = await judge.generateComments({
        language: assessment.language,
        motion: assessment.motion.textEn,
        roleLabel: roleSpec.labelJa,
        matterScore: evalRow.matterScore,
        mannerScore: evalRow.mannerScore,
        pdLevel: evalRow.pdLevel,
        itemSummaries,
        transcriptExcerpt: transcript.text.slice(0, 1500),
      });
      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: {
          goodPoints: comments.goodPoints,
          improvementPoints: comments.improvementPoints,
          overallComments: comments.overallComments,
        },
      });
    }

    // ── report: PDF発行 ──────────────────────────────
    await setProgress(prisma, assessmentId, "report");
    const existingReport = await prisma.report.findFirst({ where: { evaluationId } });
    if (!existingReport) {
      await issueReportPdf(prisma, assessmentId, evaluationId);
    }

    // ── cleanup: メディア削除（設定に従う） ─────────────
    await setProgress(prisma, assessmentId, "cleanup");
    const retention = await getRetention();
    const snapshotRetention =
      (assessment.settingsSnapshot as { retention?: string })?.retention ?? retention;
    if (snapshotRetention === "delete") {
      const targets = await prisma.mediaFile.findMany({
        where: { assessmentId, deletedAt: null },
      });
      for (const m of targets) {
        await storage.delete(m.storageKey);
        await prisma.mediaFile.update({
          where: { id: m.id },
          data: { deletedAt: new Date() },
        });
      }
    }

    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: "scored", completedAt: new Date() },
    });
    await setProgress(prisma, assessmentId, "done");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: "failed" },
    });
    await setProgress(prisma, assessmentId, "cleanup", message);
    throw err;
  }
}
