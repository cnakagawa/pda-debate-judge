import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { FrameFinding, VisionPort } from "../ports";
import { buildVisionPrompt, visionToolSchema } from "../ai/prompts";
import { env } from "../lib/env";

const framesSchema = z.object({
  frames: z.array(
    z.object({
      index: z.number().int(),
      gaze: z.enum(["camera", "down", "away", "unknown"]),
      posture: z.enum(["upright", "leaning", "unknown"]),
      gesture: z.string().nullable(),
    }),
  ),
});

const BATCH_SIZE = 20;

export class ClaudeVisionAdapter implements VisionPort {
  private client: Anthropic;
  private model: string;

  constructor(model?: string) {
    const key = env().ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is required when AI_DRIVER=real");
    this.client = new Anthropic({ apiKey: key });
    this.model = model ?? env().CLAUDE_MODEL;
  }

  async analyzeFrames(
    frames: Array<{ jpeg: Buffer; timestampSec: number }>,
  ): Promise<FrameFinding[]> {
    const findings: FrameFinding[] = [];
    for (let i = 0; i < frames.length; i += BATCH_SIZE) {
      const batch = frames.slice(i, i + BATCH_SIZE);
      const content: Anthropic.ContentBlockParam[] = [
        { type: "text", text: buildVisionPrompt(batch.length) },
      ];
      for (const f of batch) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: f.jpeg.toString("base64"),
          },
        });
      }
      const tool = visionToolSchema();
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        tools: [tool as Anthropic.Tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content }],
      });
      const block = res.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") continue;
      const parsed = framesSchema.safeParse(block.input);
      if (!parsed.success) continue;
      for (const f of parsed.data.frames) {
        const src = batch[f.index];
        if (!src) continue;
        findings.push({
          timestampSec: src.timestampSec,
          gaze: f.gaze,
          posture: f.posture,
          gesture: f.gesture,
        });
      }
    }
    return findings;
  }
}
