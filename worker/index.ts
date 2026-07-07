try {
  process.loadEnvFile(".env"); // 単体実行時に .env を読み込む（存在しなければ無視）
} catch {}

import { PrismaClient } from "@prisma/client";
import { getBoss, QUEUE_GENERATE_PM, QUEUE_SCORE } from "../src/pipeline/queue";
import { runScoringPipeline } from "../src/pipeline/scoring";
import { generatePmSpeechForAssessment } from "../src/services/generatedSpeechService";

/**
 * Workerプロセス — 採点パイプラインとPMスピーチ生成を処理する。
 * Webプロセスとは別に `npm run worker` で起動する。
 */
const prisma = new PrismaClient();

async function main() {
  const boss = await getBoss();

  await boss.work<{ assessmentId: string }>(
    QUEUE_SCORE,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async ([job]) => {
      if (!job) return;
      console.log(`[worker] scoring assessment ${job.data.assessmentId}`);
      await runScoringPipeline(prisma, job.data.assessmentId);
      console.log(`[worker] scored assessment ${job.data.assessmentId}`);
    },
  );

  await boss.work<{ assessmentId: string }>(
    QUEUE_GENERATE_PM,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async ([job]) => {
      if (!job) return;
      console.log(`[worker] generating PM speech for ${job.data.assessmentId}`);
      await generatePmSpeechForAssessment(prisma, job.data.assessmentId);
      console.log(`[worker] PM speech ready for ${job.data.assessmentId}`);
    },
  );

  console.log("[worker] started. queues:", QUEUE_SCORE, QUEUE_GENERATE_PM);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
