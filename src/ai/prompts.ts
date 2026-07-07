import type { CriterionDef, RoleSpec, RubricDefinition, ScoringContext } from "../domain/types";
import type { JudgeInput } from "../ports";
import { isCriterionExcluded } from "../domain/rubricEngine";

/**
 * 判定プロンプトのバージョン。文言を変更したら必ず上げること。
 * 評価レコードに記録され、どのプロンプトで採点されたかを追跡できる。
 */
export const JUDGE_PROMPT_VERSION = "judge-v1";
export const PM_SPEECH_PROMPT_VERSION = "pm-speech-v1";
export const COMMENTS_PROMPT_VERSION = "comments-v2";

export function applicableLlmCriteria(
  rubric: RubricDefinition,
  context: ScoringContext,
): CriterionDef[] {
  const out: CriterionDef[] = [];
  for (const item of rubric.items) {
    for (const c of item.criteria) {
      if (c.judge !== "llm") continue;
      if (isCriterionExcluded(c, context)) continue;
      out.push(c);
    }
  }
  return out;
}

function criterionText(c: CriterionDef, context: ScoringContext): string {
  return context.speechType === "reply" && c.replyText ? c.replyText : c.text;
}

/**
 * 採点判定プロンプト。
 * ルーブリック原文を埋め込み、「この基準以外で判断しない」ことを強制する。
 */
export function buildJudgePrompt(input: JudgeInput): string {
  const { rubric, roleSpec, context, motion, transcript, metrics, frameFindings } = input;

  const criteria = applicableLlmCriteria(rubric, context)
    .map((c) => `- id: ${c.id}\n  基準（原文）: ${criterionText(c, context)}`)
    .join("\n");

  const gates = [...rubric.matterGates, ...rubric.mannerGates]
    .map((g) => `- id: ${g.id} / ${g.score}点: ${g.text}`)
    .join("\n");

  const elements = roleSpec.requiredElements
    .map((e) => `- key: ${e.key} / ${e.labelJa}${e.optional ? "（任意）" : ""}`)
    .join("\n");

  const prior = input.priorSpeeches
    .map((p) => `【${p.role}スピーチ全文（AI生成・受験者はこれを聞いて反論した）】\n${p.script}`)
    .join("\n\n");

  const gazeSummary = summarizeFrames(frameFindings);

  return `あなたは一般社団法人パーラメンタリーディベート人財育成協会（PDA）の公式アセスメントシステムの採点判定エンジンです。

# 絶対的なルール
1. 判定は下記「PDAルーブリック詳細項目（原文）」のみに基づいて行うこと。あなた独自の採点基準・一般的なディベート評価基準を使うことは禁止。
2. 各詳細項目について met（充足）を true/false で判定し、必ず判定根拠 rationale と、スピーチからの引用 evidence を付けること。
3. 判定に確信が持てない場合は met=false とし、confidence を低く（0.6未満に）設定すること。
4. 点数の計算はあなたの仕事ではない（システムが別途行う）。項目の充足判定だけを行うこと。

# 受験情報
- 役割: ${roleSpec.role}（${roleSpec.labelJa}）
- 論題 (Motion): ${motion}
- スピーチ言語: ${input.language === "en" ? "英語" : "日本語"}
- 受験形式: 1人受験（Web受験版。相手チーム・POIは存在しない）

# この役割に求められるスピーチ構成（PDAスピーチシート）
${elements}

${prior ? prior + "\n" : ""}
# 受験者のスピーチ（文字起こし全文）
${transcript || "（発話なし）"}

# 計測値（参考情報。タイムマネジメント等の計測系項目はシステムが別途判定済み）
- スピーチ時間: ${metrics.speechDurationSec.toFixed(1)}秒
- 沈黙率: ${(metrics.silenceRatio * 100).toFixed(0)}%
- 話速: ${metrics.wordsPerMinute.toFixed(0)} words/分
- カメラ目線率（映像解析）: ${metrics.eyeContactRatio === null ? "計測なし" : (metrics.eyeContactRatio * 100).toFixed(0) + "%"}
- 映像フレーム所見: ${gazeSummary}

# 低得点ゲート（該当する場合のみ。通常のスピーチでは該当しない）
${gates}

内容(matter)・表現(manner)それぞれについて、該当するゲートがあれば最も当てはまる gateId を、なければ null を返すこと。

# PDAルーブリック詳細項目（原文）— これが唯一の判定基準
${criteria}

# 出力
report_judgments ツールを必ず使用して、全詳細項目の判定・ゲート判定・スピーチ構造の抽出結果を返すこと。
スピーチ構造 structure は上記「求められるスピーチ構成」の各 key について present / quote / startSec を返すこと。
itemRationales には8評価項目それぞれ（reasoning, example, relevancy, role_strategy, attitude, eye_contact_gesture, clarity, time_management）の判定サマリを日本語で書くこと。`;
}

function summarizeFrames(findings: JudgeInput["frameFindings"]): string {
  if (!findings.length) return "なし";
  const gaze = { camera: 0, down: 0, away: 0, unknown: 0 };
  const gestures: string[] = [];
  for (const f of findings) {
    gaze[f.gaze]++;
    if (f.gesture) gestures.push(`${f.timestampSec.toFixed(0)}s: ${f.gesture}`);
  }
  const total = findings.length;
  return (
    `${total}フレーム分析 — カメラ目線 ${gaze.camera}, 下向き ${gaze.down}, 視線外し ${gaze.away}, 不明 ${gaze.unknown}` +
    (gestures.length ? ` / ジェスチャー所見: ${gestures.slice(0, 10).join("; ")}` : " / ジェスチャー所見なし")
  );
}

/** report_judgments ツールの JSON Schema（構造化出力の強制） */
export function judgeToolSchema(input: JudgeInput) {
  const criterionIds = applicableLlmCriteria(input.rubric, input.context).map((c) => c.id);
  const gateIds = [
    ...input.rubric.matterGates.map((g) => g.id),
    ...input.rubric.mannerGates.map((g) => g.id),
  ];
  return {
    name: "report_judgments",
    description: "PDAルーブリック詳細項目の充足判定結果を報告する",
    input_schema: {
      type: "object" as const,
      required: ["gates", "judgments", "structure", "itemRationales"],
      properties: {
        gates: {
          type: "array",
          items: {
            type: "object",
            required: ["category", "gateId"],
            properties: {
              category: { enum: ["matter", "manner"] },
              gateId: { anyOf: [{ enum: gateIds }, { type: "null" }] },
              rationale: { type: "string" },
            },
          },
        },
        judgments: {
          type: "array",
          items: {
            type: "object",
            required: ["criterionId", "met", "confidence", "rationale"],
            properties: {
              criterionId: { enum: criterionIds },
              met: { type: "boolean" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string", description: "日本語の判定根拠" },
              evidence: {
                type: "array",
                items: {
                  type: "object",
                  required: ["quote"],
                  properties: {
                    quote: { type: "string" },
                    startSec: { type: "number" },
                  },
                },
              },
            },
          },
        },
        structure: {
          type: "array",
          items: {
            type: "object",
            required: ["key", "present"],
            properties: {
              key: { type: "string" },
              present: { type: "boolean" },
              quote: { type: "string" },
              startSec: { type: "number" },
              note: { type: "string" },
            },
          },
        },
        itemRationales: {
          type: "object",
          description: "8評価項目それぞれの判定サマリ（日本語）",
          additionalProperties: { type: "string" },
        },
      },
    },
  };
}

/** LO受験用 PMスピーチ生成プロンプト */
export function buildPmSpeechPrompt(motion: string, language: "en" | "ja"): string {
  const lang = language === "en" ? "English" : "Japanese";
  return `You are generating a Prime Minister (PM) speech for a PDA parliamentary debate assessment.
A student examinee will listen to this speech and deliver a Leader of Opposition (LO) speech against it.

# Requirements (PDA rules / speech sheet)
- Motion: ${motion}
- Language: ${lang}
- Length: about 3 minutes when spoken (approximately 480-560 words in English)
- Structure (must follow exactly, with clear signposts):
  1. Greeting and motion statement
  2. Definition (only if the motion needs clarification; otherwise skip)
  3. Signposting: announce two points by title
  4. Government Point 1 — with one clear reason and a concrete example
  5. Government Point 2 — with one clear reason and a brief example
  6. Detailed explanation of Government Point 1 (deeper reasoning, impact)
  7. Short summary and closing
- Style: clear, standard, high-school-friendly argumentation that a student LO can realistically rebut.
  Avoid obscure facts, statistics that require verification, and eccentric arguments.
- Speak naturally in the first person as the PM ("Ladies and gentlemen, ...").

Use the report_speech tool to return the full script and its structure.`;
}

export function pmSpeechToolSchema() {
  return {
    name: "report_speech",
    description: "Return the generated PM speech",
    input_schema: {
      type: "object" as const,
      required: ["script", "structure"],
      properties: {
        script: { type: "string", description: "The full speech script, plain text" },
        structure: {
          type: "object",
          required: ["gov_point_1", "gov_point_2", "gov_point_1_detail"],
          properties: {
            definition: { type: "string" },
            gov_point_1: { type: "string", description: "Point 1 title + one-line summary" },
            gov_point_2: { type: "string" },
            gov_point_1_detail: { type: "string" },
          },
        },
      },
    },
  };
}

/** コメント生成プロンプト（Good Points / Improvement Points / Overall Comments） */
export function buildCommentsPrompt(input: {
  motion: string;
  roleLabel: string;
  matterScore: number;
  mannerScore: number;
  pdLevel: string | null;
  nextLevel?: {
    targetLevel: string | null;
    requirements: { matter: number; manner: number } | null;
    keyActions: string[];
  };
  itemSummaries: Array<{
    labelJa: string;
    category: string;
    grade: string;
    metCriteria: string[];
    unmetCriteria: string[];
  }>;
  transcriptExcerpt: string;
}): string {
  const items = input.itemSummaries
    .map(
      (i) =>
        `- ${i.labelJa}（${i.category === "matter" ? "内容" : "表現"}）: ${i.grade}\n  充足: ${i.metCriteria.join(" / ") || "なし"}\n  未充足: ${i.unmetCriteria.join(" / ") || "なし"}`,
    )
    .join("\n");

  const nextLevel = input.nextLevel?.targetLevel
    ? `
# 次のレベルへのプラン（システムがルーブリックとPDレベル換算表から決定的に導出済み）
- 目標: ${input.nextLevel.targetLevel}（内容${input.nextLevel.requirements?.matter}点以上・表現${input.nextLevel.requirements?.manner}点以上が必要）
- 優先練習項目（ルーブリック原文）:
${input.nextLevel.keyActions.map((a) => `  ・${a}`).join("\n")}
improvementPoints と overallComments には、この目標レベルと優先練習項目を必ず反映すること。`
    : "";

  return `あなたはPDAのアセスメントレポートのコメントを書く教育者です。高校生の受験者に向けて書きます。

# 評価結果（PDAルーブリックによる判定済み。これ以外の根拠でコメントしない）
- 論題: ${input.motion}
- 役割: ${input.roleLabel}
- 内容 (Matter): ${input.matterScore}/10、表現 (Manner): ${input.mannerScore}/10、PD Level: ${input.pdLevel ?? "判定外"}
${items}
${nextLevel}

# スピーチ抜粋
${input.transcriptExcerpt}

# 書くもの（report_comments ツールで返す）
① goodPoints — 良かった点。② improvementPoints — 改善点。③ overallComments — 総評。

# 制約
- それぞれ日本語150〜200字。
- 高校生が読んで理解でき、次の練習で何をすればよいかが分かる具体的な内容。
- ①②③のすべてで、内容（Matter）と表現（Manner）の両方に触れること。
- improvementPoints は未充足の詳細項目のうち、次の帯域（点数）に上がるために効果が大きいものを優先。
- 人格や能力を否定する表現は禁止。前向きな言い方をする。`;
}

export function commentsToolSchema() {
  return {
    name: "report_comments",
    description: "アセスメントレポートのコメント3種を返す",
    input_schema: {
      type: "object" as const,
      required: ["goodPoints", "improvementPoints", "overallComments"],
      properties: {
        goodPoints: { type: "string" },
        improvementPoints: { type: "string" },
        overallComments: { type: "string" },
      },
    },
  };
}

/** 映像フレーム解析プロンプト（アイコンタクト・姿勢・ジェスチャー） */
export function buildVisionPrompt(count: number): string {
  return `これらはWebカメラで録画されたディベートスピーチから等間隔に抽出した${count}枚のフレームです。
各フレームについて、話者の状態を分類してください。判定できない場合は unknown を使ってください。

- gaze: "camera"（カメラ＝聴衆の方を見ている）/ "down"（下・手元のメモを見ている）/ "away"（横や上など聴衆以外）/ "unknown"
- posture: "upright"（正しい姿勢）/ "leaning"（肘をつく・傾くなど崩れた姿勢）/ "unknown"
- gesture: 内容に合わせた意図的なジェスチャーが見られる場合はその短い説明（日本語）、なければ null

report_frames ツールでフレーム順に返してください。`;
}

export function visionToolSchema() {
  return {
    name: "report_frames",
    description: "各フレームの分析結果を返す",
    input_schema: {
      type: "object" as const,
      required: ["frames"],
      properties: {
        frames: {
          type: "array",
          items: {
            type: "object",
            required: ["index", "gaze", "posture", "gesture"],
            properties: {
              index: { type: "integer" },
              gaze: { enum: ["camera", "down", "away", "unknown"] },
              posture: { enum: ["upright", "leaning", "unknown"] },
              gesture: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
          },
        },
      },
    },
  };
}
