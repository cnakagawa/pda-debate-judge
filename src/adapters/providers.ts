import type { JudgePort, PdfPort, SttPort, StoragePort, TtsPort, VisionPort } from "../ports";
import { env } from "../lib/env";
import { ClaudeJudgeAdapter } from "./claudeJudge";
import { ClaudeVisionAdapter } from "./claudeVision";
import { OpenAiSttAdapter, OpenAiTtsAdapter } from "./openaiSpeech";
import { MockJudgeAdapter, MockSttAdapter, MockTtsAdapter, MockVisionAdapter } from "./mock";
import { LocalStorageAdapter, S3StorageAdapter } from "./storage";
import { PlaywrightPdfAdapter } from "./pdf";

/**
 * プロバイダファクトリ。環境変数（AI_DRIVER / STORAGE_DRIVER）で実装を切替える。
 * 将来のプロバイダ追加はここに分岐を足すだけでよい。
 */

export function makeStt(): SttPort {
  return env().AI_DRIVER === "real" ? new OpenAiSttAdapter() : new MockSttAdapter();
}

export function makeTts(): TtsPort {
  return env().AI_DRIVER === "real" ? new OpenAiTtsAdapter() : new MockTtsAdapter();
}

export function makeJudge(model?: string): JudgePort {
  return env().AI_DRIVER === "real" ? new ClaudeJudgeAdapter(model) : new MockJudgeAdapter();
}

export function makeVision(model?: string): VisionPort {
  return env().AI_DRIVER === "real" ? new ClaudeVisionAdapter(model) : new MockVisionAdapter();
}

export function makeStorage(): StoragePort {
  return env().STORAGE_DRIVER === "s3" ? new S3StorageAdapter() : new LocalStorageAdapter();
}

export function makePdf(): PdfPort {
  return new PlaywrightPdfAdapter();
}
