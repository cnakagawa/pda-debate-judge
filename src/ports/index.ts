import type {
  CriterionJudgment,
  DebateRole,
  DeliveryMetrics,
  GateJudgment,
  RoleSpec,
  RubricDefinition,
  ScoringContext,
} from "../domain/types";

export type Lang = "en" | "ja";

// ─────────────────────────── STT ───────────────────────────

export interface SttWord {
  w: string;
  start: number;
  end: number;
  conf?: number;
}

export interface SttResult {
  text: string;
  words: SttWord[];
  language: string;
  provider: string;
  model: string;
}

export interface SttPort {
  transcribe(audio: Buffer, opts: { language: Lang; mimeType: string }): Promise<SttResult>;
}

// ─────────────────────────── TTS ───────────────────────────

export interface TtsPort {
  synthesize(text: string, opts: { language: Lang }): Promise<{ audio: Buffer; mimeType: string }>;
}

// ─────────────────────────── Vision ───────────────────────────

export interface FrameFinding {
  timestampSec: number;
  gaze: "camera" | "down" | "away" | "unknown";
  posture: "upright" | "leaning" | "unknown";
  gesture: string | null;
}

export interface VisionPort {
  analyzeFrames(
    frames: Array<{ jpeg: Buffer; timestampSec: number }>,
  ): Promise<FrameFinding[]>;
}

// ─────────────────────────── Judge (LLM) ───────────────────────────

export interface SpeechStructureElement {
  key: string;
  present: boolean;
  quote?: string;
  startSec?: number;
  note?: string;
}

export interface JudgeInput {
  rubric: RubricDefinition;
  roleSpec: RoleSpec;
  context: ScoringContext;
  motion: string;
  language: Lang;
  transcript: string;
  words: SttWord[];
  metrics: DeliveryMetrics;
  frameFindings: FrameFinding[];
  /** Prior speech the examinee responded to (e.g. generated PM speech for an LO assessment). */
  priorSpeeches: Array<{ role: DebateRole; script: string }>;
}

export interface JudgeOutput {
  gates: GateJudgment[];
  /** Judgments for every judge==="llm" criterion applicable in this context. */
  judgments: CriterionJudgment[];
  structure: SpeechStructureElement[];
  /** Per-item summary rationale (for the admin screen). Keyed by item key. */
  itemRationales: Record<string, string>;
  model: string;
  promptVersion: string;
}

export interface CommentsInput {
  language: Lang;
  motion: string;
  roleLabel: string;
  matterScore: number;
  mannerScore: number;
  pdLevel: string | null;
  itemSummaries: Array<{
    itemKey: string;
    labelJa: string;
    category: "matter" | "manner";
    grade: string;
    metCriteria: string[];
    unmetCriteria: string[];
  }>;
  transcriptExcerpt: string;
}

export interface CommentsOutput {
  goodPoints: string;
  improvementPoints: string;
  overallComments: string;
}

export interface GeneratedSpeechOutput {
  script: string;
  structure: Record<string, string>;
  model: string;
  promptVersion: string;
}

export interface JudgePort {
  judgeSpeech(input: JudgeInput): Promise<JudgeOutput>;
  generateComments(input: CommentsInput): Promise<CommentsOutput>;
  generatePmSpeech(input: { motion: string; language: Lang }): Promise<GeneratedSpeechOutput>;
}

// ─────────────────────────── Storage ───────────────────────────

export interface StoragePort {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// ─────────────────────────── PDF ───────────────────────────

export interface PdfPort {
  renderHtmlToPdf(html: string): Promise<Buffer>;
}
