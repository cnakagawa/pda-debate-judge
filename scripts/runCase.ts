import { DEFAULT_RUBRIC } from "../src/domain/rubric";
import { computeScore } from "../src/domain/rubricEngine";
import { judgeMetricCriteria } from "../src/domain/metricCriteria";
import { roleSpecFor } from "../src/domain/roleSpecs";
import { buildNextLevelPlan } from "../src/domain/nextLevelPlan";
import { makeJudge } from "../src/adapters/providers";
import type { DebateRole, DeliveryMetrics, ScoreResult, ScoringContext } from "../src/domain/types";
import type { JudgeOutput, SttWord } from "../src/ports";

/**
 * 較正・ゴールデン回帰共通のケース実行器。
 * 動画・STTを介さず、文字起こしテキスト＋計測値フィクスチャから
 * 本番と同一の判定（LLM）＋採点（RubricEngine）を実行する。
 */

export interface CaseMetrics {
  speechDurationSec?: number;
  silenceRatio?: number;
  longestSilenceSec?: number;
  wordsPerMinute?: number;
  eyeContactRatio?: number | null;
}

export interface JudgeCase {
  id: string;
  role: DebateRole;
  motion: string;
  language?: "en" | "ja";
  transcript: string;
  /** 未指定項目は標準値（3分・沈黙5%・目線60%）を使用 */
  metrics?: CaseMetrics;
  /** LOケース: 受験者が聞いたPMスピーチ */
  pmSpeech?: string;
}

export interface CaseResult {
  score: ScoreResult;
  judgeOutput: JudgeOutput;
  metrics: DeliveryMetrics;
}

function synthesizeWords(transcript: string, durationSec: number): SttWord[] {
  const tokens = transcript.split(/\s+/).filter(Boolean);
  const step = durationSec / Math.max(tokens.length, 1);
  return tokens.map((w, i) => ({
    w,
    start: +(i * step).toFixed(2),
    end: +((i + 1) * step - 0.02).toFixed(2),
  }));
}

export async function runCase(c: JudgeCase): Promise<CaseResult> {
  const roleSpec = roleSpecFor(c.role);
  const context: ScoringContext = { speechType: roleSpec.speechType, poiAvailable: false };

  const m = c.metrics ?? {};
  const speechDurationSec = m.speechDurationSec ?? 175;
  const wordCount = c.transcript.split(/\s+/).filter(Boolean).length;
  const metrics: DeliveryMetrics = {
    speechDurationSec,
    silenceRatio: m.silenceRatio ?? 0.05,
    longestSilenceSec: m.longestSilenceSec ?? 2,
    wordsPerMinute: m.wordsPerMinute ?? (wordCount / speechDurationSec) * 60,
    eyeContactRatio: m.eyeContactRatio === undefined ? 0.6 : m.eyeContactRatio,
    framesAnalyzed: 0,
  };

  const judge = makeJudge();
  const judgeOutput = await judge.judgeSpeech({
    rubric: DEFAULT_RUBRIC,
    roleSpec,
    context,
    motion: c.motion,
    language: c.language ?? "en",
    transcript: c.transcript,
    words: synthesizeWords(c.transcript, speechDurationSec),
    metrics,
    frameFindings: [],
    priorSpeeches: c.pmSpeech ? [{ role: "PM", script: c.pmSpeech }] : [],
  });

  const metricJudgments = judgeMetricCriteria(DEFAULT_RUBRIC, metrics, roleSpec.timeLimits);
  const score = computeScore({
    rubric: DEFAULT_RUBRIC,
    context,
    judgments: [...judgeOutput.judgments, ...metricJudgments],
    gates: judgeOutput.gates,
  });

  return { score, judgeOutput, metrics };
}

export function formatScoreLine(score: ScoreResult): string {
  return `内容 ${score.matter.score}/10 (${score.matter.grade}) ／ 表現 ${score.manner.score}/10 (${score.manner.grade}) ／ 合計 ${score.total} ／ ${score.pdLevel ?? "判定外"}`;
}

export function formatDetails(result: CaseResult): string {
  const lines: string[] = [];
  for (const cat of [result.score.matter, result.score.manner]) {
    for (const item of cat.items) {
      lines.push(`  [${item.grade}] ${item.key}`);
      for (const c of item.criteria) {
        if (c.excluded) continue;
        const conf = c.confidence !== undefined ? ` conf=${c.confidence.toFixed(2)}` : "";
        lines.push(`      ${c.met ? "✓" : "✗"} (${c.band}) ${c.criterionId}${conf} — ${c.rationale ?? ""}`);
      }
    }
  }
  const plan = buildNextLevelPlan(
    result.score,
    DEFAULT_RUBRIC,
    { speechType: "constructive", poiAvailable: false },
    result.score.pdLevel as never,
  );
  lines.push(`  次レベル: ${plan.targetLevel ?? "—（最上位）"}`);
  return lines.join("\n");
}
