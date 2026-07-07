import PgBoss from "pg-boss";
import { env } from "../lib/env";

/**
 * ジョブキュー（pg-boss / PostgreSQLベース）。
 * Webプロセスは send のみ、Workerプロセスが work で処理する。
 */

export const QUEUE_SCORE = "score-assessment";
export const QUEUE_GENERATE_PM = "generate-pm-speech";

let boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss({ connectionString: env().DATABASE_URL });
    boss.on("error", (err) => console.error("[pg-boss]", err));
    await boss.start();
    await boss.createQueue(QUEUE_SCORE);
    await boss.createQueue(QUEUE_GENERATE_PM);
  }
  return boss;
}

export async function enqueueScoring(assessmentId: string): Promise<void> {
  const b = await getBoss();
  await b.send(QUEUE_SCORE, { assessmentId }, {
    retryLimit: 2,
    retryDelay: 30,
    expireInSeconds: 1800,
    singletonKey: assessmentId, // 二重投入防止
  });
}

export async function enqueuePmSpeechGeneration(assessmentId: string): Promise<void> {
  const b = await getBoss();
  await b.send(QUEUE_GENERATE_PM, { assessmentId }, {
    retryLimit: 2,
    retryDelay: 10,
    expireInSeconds: 600,
    singletonKey: assessmentId,
  });
}
