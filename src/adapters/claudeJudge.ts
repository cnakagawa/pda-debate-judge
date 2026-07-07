import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type {
  CommentsInput,
  CommentsOutput,
  GeneratedSpeechOutput,
  JudgeInput,
  JudgeOutput,
  JudgePort,
  Lang,
} from "../ports";
import {
  JUDGE_PROMPT_VERSION,
  PM_SPEECH_PROMPT_VERSION,
  buildCommentsPrompt,
  buildJudgePrompt,
  buildPmSpeechPrompt,
  commentsToolSchema,
  judgeToolSchema,
  pmSpeechToolSchema,
  applicableLlmCriteria,
} from "../ai/prompts";
import { env } from "../lib/env";

const judgeOutputSchema = z.object({
  gates: z.array(
    z.object({
      category: z.enum(["matter", "manner"]),
      gateId: z.string().nullable(),
      rationale: z.string().optional(),
    }),
  ),
  judgments: z.array(
    z.object({
      criterionId: z.string(),
      met: z.boolean(),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
      evidence: z
        .array(z.object({ quote: z.string(), startSec: z.number().optional() }))
        .optional(),
    }),
  ),
  structure: z.array(
    z.object({
      key: z.string(),
      present: z.boolean(),
      quote: z.string().optional(),
      startSec: z.number().optional(),
      note: z.string().optional(),
    }),
  ),
  itemRationales: z.record(z.string(), z.string()),
});

const commentsSchema = z.object({
  goodPoints: z.string().min(1),
  improvementPoints: z.string().min(1),
  overallComments: z.string().min(1),
});

const speechSchema = z.object({
  script: z.string().min(200),
  structure: z.record(z.string(), z.string()),
});

export class ClaudeJudgeAdapter implements JudgePort {
  private client: Anthropic;
  private model: string;

  constructor(model?: string) {
    const key = env().ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is required when AI_DRIVER=real");
    this.client = new Anthropic({ apiKey: key });
    this.model = model ?? env().CLAUDE_MODEL;
  }

  private async callTool<T>(
    prompt: string,
    tool: { name: string; description: string; input_schema: object },
    schema: z.ZodType<T>,
    maxTokens = 8192,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      // temperature等のサンプリングパラメータはClaude Sonnet 5以降で廃止のため送らない
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        tools: [tool as Anthropic.Tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: prompt }],
      });
      const block = res.content.find((b) => b.type === "tool_use");
      if (block && block.type === "tool_use") {
        const parsed = schema.safeParse(block.input);
        if (parsed.success) return parsed.data;
        lastError = parsed.error;
      }
    }
    throw new Error(`Claude structured output failed after retries: ${lastError}`);
  }

  async judgeSpeech(input: JudgeInput): Promise<JudgeOutput> {
    const raw = await this.callTool(
      buildJudgePrompt(input),
      judgeToolSchema(input),
      judgeOutputSchema,
      16384,
    );

    // 必須の詳細項目がすべて判定されているか検証。欠けはmet=false扱いで補完。
    const expected = applicableLlmCriteria(input.rubric, input.context).map((c) => c.id);
    const got = new Set(raw.judgments.map((j) => j.criterionId));
    const judgments = [...raw.judgments.map((j) => ({ ...j, source: "llm" as const }))];
    for (const id of expected) {
      if (!got.has(id)) {
        judgments.push({
          criterionId: id,
          met: false,
          confidence: 0,
          rationale: "AI判定が返されなかったため未充足として扱いました（要確認）",
          source: "llm",
        });
      }
    }

    return {
      gates: raw.gates,
      judgments,
      structure: raw.structure,
      itemRationales: raw.itemRationales,
      model: this.model,
      promptVersion: JUDGE_PROMPT_VERSION,
    };
  }

  async generateComments(input: CommentsInput): Promise<CommentsOutput> {
    // 文字数制約（150〜200字）を満たすまで最大3回生成
    for (let attempt = 0; attempt < 3; attempt++) {
      const out = await this.callTool(
        buildCommentsPrompt(input),
        commentsToolSchema(),
        commentsSchema,
        4096,
      );
      const lengths = [out.goodPoints, out.improvementPoints, out.overallComments].map(
        (s) => s.length,
      );
      if (lengths.every((l) => l >= 120 && l <= 260)) return out;
    }
    // 3回で収束しなくても最後の結果を返すより、明示的に再生成失敗を投げず妥協値を返す
    const out = await this.callTool(
      buildCommentsPrompt(input),
      commentsToolSchema(),
      commentsSchema,
      4096,
    );
    return out;
  }

  async generatePmSpeech(input: { motion: string; language: Lang }): Promise<GeneratedSpeechOutput> {
    // 構成・語数の自己検査つき生成（最大3回）
    let last: z.infer<typeof speechSchema> | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const out = await this.callTool(
        buildPmSpeechPrompt(input.motion, input.language),
        pmSpeechToolSchema(),
        speechSchema,
        8192,
      );
      last = out;
      const wordCount = out.script.split(/\s+/).length;
      const hasStructure =
        !!out.structure.gov_point_1 && !!out.structure.gov_point_2 && !!out.structure.gov_point_1_detail;
      if (hasStructure && wordCount >= 420 && wordCount <= 650) {
        return {
          script: out.script,
          structure: out.structure,
          model: this.model,
          promptVersion: PM_SPEECH_PROMPT_VERSION,
        };
      }
    }
    if (!last) throw new Error("PM speech generation failed");
    return {
      script: last.script,
      structure: last.structure,
      model: this.model,
      promptVersion: PM_SPEECH_PROMPT_VERSION,
    };
  }
}
