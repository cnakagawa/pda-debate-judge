import OpenAI, { toFile } from "openai";
import type { Lang, SttPort, SttResult, TtsPort } from "../ports";
import { env } from "../lib/env";

export class OpenAiSttAdapter implements SttPort {
  private client: OpenAI;
  private model: string;

  constructor() {
    const key = env().OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is required when AI_DRIVER=real");
    this.client = new OpenAI({ apiKey: key });
    this.model = env().STT_MODEL;
  }

  async transcribe(audio: Buffer, opts: { language: Lang; mimeType: string }): Promise<SttResult> {
    const ext = opts.mimeType.includes("wav") ? "wav" : opts.mimeType.includes("mp3") ? "mp3" : "webm";
    const file = await toFile(audio, `speech.${ext}`, { type: opts.mimeType });
    const res = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
      language: opts.language,
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });
    const verbose = res as unknown as {
      text: string;
      words?: Array<{ word: string; start: number; end: number }>;
      segments?: Array<{ text: string; start: number; end: number }>;
    };
    const words =
      verbose.words?.map((w) => ({ w: w.word, start: w.start, end: w.end })) ??
      // フォールバック: セグメント単位を単語相当として扱う
      (verbose.segments ?? []).map((s) => ({ w: s.text.trim(), start: s.start, end: s.end }));
    return {
      text: verbose.text,
      words,
      language: opts.language,
      provider: "openai",
      model: this.model,
    };
  }
}

export class OpenAiTtsAdapter implements TtsPort {
  private client: OpenAI;

  constructor() {
    const key = env().OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is required when AI_DRIVER=real");
    this.client = new OpenAI({ apiKey: key });
  }

  async synthesize(text: string, _opts: { language: Lang }): Promise<{ audio: Buffer; mimeType: string }> {
    const res = await this.client.audio.speech.create({
      model: env().TTS_MODEL,
      voice: env().TTS_VOICE as "alloy",
      input: text,
      response_format: "mp3",
      speed: 1.0,
    });
    return { audio: Buffer.from(await res.arrayBuffer()), mimeType: "audio/mpeg" };
  }
}
