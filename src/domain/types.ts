/**
 * Core domain types for the PD Assessment System.
 *
 * These types are framework-independent and shared by the rubric engine,
 * the scoring pipeline, the API layer and the UI.
 */

export type Grade = "S" | "A" | "B" | "C";

export type Category = "matter" | "manner";

export type MatterItemKey =
  | "reasoning"
  | "example"
  | "relevancy"
  | "role_strategy";

export type MannerItemKey =
  | "attitude"
  | "eye_contact_gesture"
  | "clarity"
  | "time_management";

export type ItemKey = MatterItemKey | MannerItemKey;

export type DebateRole = "PM" | "LO" | "MG" | "MO" | "LOR" | "PMR";

export type SpeechType = "constructive" | "reply";

export type Band = "B" | "A" | "S";

/**
 * Applicability of a criterion in a given assessment format.
 *
 * - "always": applies in every format.
 * - "poi_available": only applies when POIs can occur (team debate).
 *   In solo web assessments the criterion is excluded from denominators.
 * - "poi_available_exception": the rubric itself carries an exception clause
 *   ("ただし、相手側からのPOIが1回以下の場合を除く。"). When POIs cannot occur
 *   the criterion is exempt (treated as satisfied for band requirements).
 */
export type CriterionApplicability =
  | "always"
  | "poi_available"
  | "poi_available_exception";

/** Who decides whether the criterion is met. */
export type CriterionJudgeSource = "llm" | "metric";

export interface CriterionDef {
  /** Stable id, e.g. "matter.reasoning.S1". Referenced by judgments and admin overrides. */
  id: string;
  band: Band;
  /** Exact rubric wording (constructive speeches). Never paraphrase. */
  text: string;
  /** Wording variant for reply speeches (the ［ ］ text in the rubric), if different. */
  replyText?: string;
  applicability: CriterionApplicability;
  judge: CriterionJudgeSource;
  /** For judge === "metric": which measured value decides this criterion. */
  metricKey?: "silence_ratio_half" | "time_b" | "time_a" | "time_s";
}

export interface ItemDef {
  key: ItemKey;
  category: Category;
  labelJa: string;
  labelEn: string;
  criteria: CriterionDef[];
}

export interface GateDef {
  /** Score assigned when this gate condition holds (0, 1 or 2). */
  score: 0 | 1 | 2;
  id: string;
  text: string;
}

export interface RubricDefinition {
  /** e.g. "2020-07-10.v1" */
  version: string;
  matterGates: GateDef[];
  mannerGates: GateDef[];
  items: ItemDef[];
}

/** A single criterion satisfaction judgment (from LLM, metric computation, or admin override). */
export interface CriterionJudgment {
  criterionId: string;
  met: boolean;
  /** 0..1; low confidence surfaces a "要確認" badge in the admin UI. */
  confidence?: number;
  rationale?: string;
  evidence?: Array<{ quote: string; startSec?: number }>;
  source: "llm" | "metric" | "admin";
}

/** Gate decision for one category (before band scoring). */
export interface GateJudgment {
  category: Category;
  /** Highest triggered gate, or null when no gate applies. */
  gateId: string | null;
  rationale?: string;
}

export interface ScoringContext {
  speechType: SpeechType;
  /** false for solo web assessments (no opponent, no POIs). */
  poiAvailable: boolean;
}

export interface ItemResult {
  key: ItemKey;
  category: Category;
  grade: Grade;
  bMet: boolean;
  aMet: boolean;
  /** S-band detail criteria satisfied / applicable (after POI exclusions). */
  sMetCount: number;
  sApplicableCount: number;
  /** "特に評価できる" — at least half of the applicable S detail criteria are met. */
  especiallyCommendable: boolean;
  criteria: Array<CriterionJudgment & { band: Band; text: string; excluded: boolean }>;
}

export interface CategoryResult {
  category: Category;
  /** 0-10 per the rubric's 補足 rules. */
  score: number;
  /** PD検定での細目表記: 0-2=C, 3-5=B, 6=A, 7-10=S. */
  grade: Grade;
  band: "gate" | "B" | "A" | "S";
  gate: { score: number; gateId: string } | null;
  items: ItemResult[];
}

export interface ScoreResult {
  rubricVersion: string;
  matter: CategoryResult;
  manner: CategoryResult;
  /** 0-20 */
  total: number;
  /** "PD1" (highest) .. "PD6", or null when outside every level region. */
  pdLevel: string | null;
  /** CEFR reference band for the PD level, e.g. "B1〜C1". */
  cefrReference: string | null;
}

/** Deterministic measurements extracted from the recording (delivery metrics). */
export interface DeliveryMetrics {
  speechDurationSec: number;
  silenceRatio: number;
  longestSilenceSec: number;
  wordsPerMinute: number;
  eyeContactRatio: number | null;
  framesAnalyzed: number;
}

export interface TimeLimits {
  /** Regulation speech length in seconds (PM–MO: 180, LOR–PMR: 120). */
  regulation: number;
  /** B threshold: at least half of regulation. */
  minHalf: number;
  /** A threshold: at least the lower bound of the allowed range. */
  aMin: number;
  /** S threshold: finished within the allowed range. */
  graceMax: number;
}

export interface RequiredElement {
  key: string;
  labelJa: string;
  labelEn: string;
  optional?: boolean;
}

export interface RoleSpec {
  role: DebateRole;
  side: "government" | "opposition";
  speechType: SpeechType;
  labelJa: string;
  timeLimits: TimeLimits;
  /** Speech-sheet elements this speaker must cover; drives judging prompts and UI memo slots. */
  requiredElements: RequiredElement[];
  /** Prior speeches that must be generated and played before recording (e.g. LO needs a PM speech). */
  inputs: Array<{ role: DebateRole; kind: "generated_speech" }>;
  enabled: boolean;
}
