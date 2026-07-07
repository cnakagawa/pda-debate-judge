import type {
  CommentsInput,
  CommentsOutput,
  FrameFinding,
  GeneratedSpeechOutput,
  JudgeInput,
  JudgeOutput,
  JudgePort,
  Lang,
  SttPort,
  SttResult,
  TtsPort,
  VisionPort,
} from "../ports";
import {
  COMMENTS_PROMPT_VERSION,
  JUDGE_PROMPT_VERSION,
  PM_SPEECH_PROMPT_VERSION,
  applicableLlmCriteria,
} from "../ai/prompts";

/**
 * Mockドライバ（AI_DRIVER=mock）。
 * APIキーなしで開発・E2E確認を行うための決定的な実装。本番では使用しない。
 * 判定はスピーチの表層特徴（語数・構成マーカー等）による近似で、デモ用途に限る。
 */

const SAMPLE_PM_SPEECH = (motion: string) => `Ladies and gentlemen, hello everyone. Today's motion is: ${motion}. We, the government side, strongly support this motion. Let me define the motion briefly: we propose this policy for all people in our society, starting next year. We have two points today. Point one: this policy protects people's health and safety. Point two: this policy makes our society fairer for everyone. Let me explain point one. First, the current situation causes serious problems. For example, imagine a student who suffers every single day because of this problem. Under our policy, that student can finally live safely. The reason is simple: when we remove the cause of harm, people's daily lives improve immediately. This is why the government must act now. Moving to point two: fairness. Right now, only some people enjoy the benefits while others are left behind. For example, families with less money cannot access the same opportunities. Our policy gives everyone an equal chance. This is important because a fair society is a stronger society. Now, let me explain point one in more detail. Health and safety are the foundation of everything. If people are not safe, they cannot study, work, or enjoy their lives. Consider the numbers: many people are affected by this problem every year, and the damage lasts for a long time. Only the government side can solve this, because the opposition keeps the current dangerous situation. The difference between our two sides is clear: with the motion, people are protected; without it, the harm continues. Even if there are small costs, the benefit of saving people's health is much greater. That is why the importance of this point cannot be ignored. To summarize, we support this motion for two reasons: health and safety, and fairness for all. The government side clearly wins this debate. Thank you very much.`;

function makeWords(text: string, durationSec: number) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const step = durationSec / Math.max(tokens.length, 1);
  return tokens.map((w, i) => ({
    w,
    start: +(i * step).toFixed(2),
    end: +((i + 1) * step - 0.02).toFixed(2),
    conf: 0.95,
  }));
}

export class MockSttAdapter implements SttPort {
  async transcribe(_audio: Buffer, opts: { language: Lang; mimeType: string }): Promise<SttResult> {
    // 実音声は解析せず、規定時間内に収まるサンプルスピーチを返す（デモ用）
    const text = SAMPLE_PM_SPEECH("the demo motion");
    return {
      text,
      words: makeWords(text, 172),
      language: opts.language,
      provider: "mock",
      model: "mock-stt",
    };
  }
}

export class MockTtsAdapter implements TtsPort {
  async synthesize(text: string, _opts: { language: Lang }): Promise<{ audio: Buffer; mimeType: string }> {
    // 1秒あたり約2.7語で無音WAVを生成（再生時間だけ本物らしく）
    const seconds = Math.min(Math.max(Math.round(text.split(/\s+/).length / 2.7), 5), 240);
    const sampleRate = 8000;
    const numSamples = seconds * sampleRate;
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + numSamples * 2, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(numSamples * 2, 40);
    const data = Buffer.alloc(numSamples * 2);
    // 微小トーンを入れて「再生されている」ことが分かるようにする
    for (let i = 0; i < numSamples; i++) {
      const v = Math.round(Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 800);
      data.writeInt16LE(v, i * 2);
    }
    return { audio: Buffer.concat([header, data]), mimeType: "audio/wav" };
  }
}

export class MockVisionAdapter implements VisionPort {
  async analyzeFrames(
    frames: Array<{ jpeg: Buffer; timestampSec: number }>,
  ): Promise<FrameFinding[]> {
    return frames.map((f, i) => ({
      timestampSec: f.timestampSec,
      gaze: i % 3 === 2 ? "down" : "camera", // 目線率 ~66%
      posture: "upright",
      gesture: i % 6 === 0 ? "手で要点を示すジェスチャー" : null,
    }));
  }
}

export class MockJudgeAdapter implements JudgePort {
  async judgeSpeech(input: JudgeInput): Promise<JudgeOutput> {
    const text = input.transcript.toLowerCase();
    const wordCount = input.transcript.split(/\s+/).filter(Boolean).length;

    // 低得点ゲート
    let matterGate: string | null = null;
    let mannerGate: string | null = null;
    if (wordCount === 0) {
      matterGate = "matter.gate0";
      mannerGate = "manner.gate0";
    } else if (wordCount < 15) {
      matterGate = "matter.gate1";
    } else if (wordCount < 40) {
      matterGate = "matter.gate2";
    }

    const has = (...kw: string[]) => kw.some((k) => text.includes(k));
    const signpost = has("point one", "point two", "first point", "two points", "first,", "second,");
    const example = has("for example", "imagine", "for instance");
    const reason = has("because", "the reason", "why");
    const comparison = has("difference", "only the government", "only the opposition", "even if");
    const importance = has("important", "importance", "foundation");
    const rebuttal = has("they said", "the government said", "however", "but this is wrong", "we disagree");

    const longEnough = wordCount > 250;
    const midLength = wordCount > 120;

    const eyeRatio = input.metrics.eyeContactRatio ?? 0;
    const lowSilence = input.metrics.silenceRatio <= 0.1;

    const heuristics: Record<string, { met: boolean; why: string }> = {
      "matter.reasoning.B1": { met: reason, why: "理由づけ表現の有無" },
      "matter.reasoning.A1": { met: reason && midLength, why: "理由の展開量" },
      "matter.reasoning.S1": { met: comparison, why: "両側の差の説明表現" },
      "matter.reasoning.S2": { met: importance, why: "重要性への言及" },
      "matter.reasoning.S3": { met: reason && signpost && longEnough, why: "複数の理由" },
      "matter.example.B1": { met: example, why: "例示表現の有無" },
      "matter.example.A1": { met: example && midLength, why: "例の描写量" },
      "matter.example.S1": { met: example && longEnough, why: "固有な例の展開" },
      "matter.example.S2": { met: example && has("many people", "everyone", "families"), why: "一般化した例" },
      "matter.relevancy.B1": { met: midLength, why: "論題への言及" },
      "matter.relevancy.A1": { met: has("motion") && midLength, why: "論題の肯定/否定への直結" },
      "matter.relevancy.S1": { met: has("motion") && longEnough, why: "論題キーワードの固有性" },
      "matter.relevancy.S2": { met: false, why: "派生キーワードの固有性（モックでは常に未充足）" },
      "matter.role_strategy.B1": {
        met: input.roleSpec.role === "LO" ? rebuttal || signpost : signpost || midLength,
        why: "役割の一部充足",
      },
      "matter.role_strategy.A1": {
        met: input.roleSpec.role === "LO" ? rebuttal && signpost : signpost && midLength,
        why: "役割とサインポストの充足",
      },
      "matter.role_strategy.S1": { met: signpost && comparison, why: "戦略的立ち回り" },
      "matter.role_strategy.S2": { met: signpost && longEnough, why: "わかりやすさの工夫" },
      "manner.attitude.A1": { met: lowSilence, why: "沈黙率と姿勢（映像所見）" },
      "manner.attitude.S1": { met: lowSilence && longEnough, why: "自信・落ち着き" },
      "manner.eye_contact_gesture.B1": { met: eyeRatio >= 0.2, why: `目線率 ${(eyeRatio * 100).toFixed(0)}%` },
      "manner.eye_contact_gesture.A1": { met: eyeRatio >= 0.5, why: `目線率 ${(eyeRatio * 100).toFixed(0)}%` },
      "manner.eye_contact_gesture.S1": { met: eyeRatio >= 0.8, why: `目線率 ${(eyeRatio * 100).toFixed(0)}%` },
      "manner.eye_contact_gesture.S2": {
        met: input.frameFindings.some((f) => f.gesture),
        why: "ジェスチャー所見の有無",
      },
      "manner.clarity.B1": { met: wordCount > 30, why: "発話量" },
      "manner.clarity.A1": { met: input.metrics.wordsPerMinute >= 90 && input.metrics.wordsPerMinute <= 200, why: "話速" },
      "manner.clarity.S1": { met: false, why: "緩急（モックでは常に未充足）" },
      "manner.clarity.S2": { met: false, why: "感情（モックでは常に未充足）" },
      "manner.clarity.S3": { met: lowSilence && midLength, why: "淀みなさ" },
    };

    const judgments = applicableLlmCriteria(input.rubric, input.context).map((c) => {
      const h = heuristics[c.id] ?? { met: false, why: "モック未定義項目" };
      return {
        criterionId: c.id,
        met: matterGate !== null && c.id.startsWith("matter.") ? false : h.met,
        confidence: 0.9,
        rationale: `［モック判定］${h.why}`,
        evidence: h.met
          ? [{ quote: input.transcript.split(/(?<=\.)\s+/)[1] ?? input.transcript.slice(0, 80) }]
          : [],
        source: "llm" as const,
      };
    });

    const structure = input.roleSpec.requiredElements.map((e) => ({
      key: e.key,
      present: wordCount > 100,
      quote: wordCount > 100 ? input.transcript.slice(0, 60) + "…" : undefined,
      note: "モック判定",
    }));

    const itemRationales: Record<string, string> = {};
    for (const item of input.rubric.items) {
      itemRationales[item.key] = `［モック］${item.labelJa} の表層特徴に基づく近似判定です。`;
    }

    return {
      gates: [
        { category: "matter", gateId: matterGate },
        { category: "manner", gateId: mannerGate },
      ],
      judgments,
      structure,
      itemRationales,
      model: "mock-judge",
      promptVersion: JUDGE_PROMPT_VERSION,
    };
  }

  async generateComments(input: CommentsInput): Promise<CommentsOutput> {
    const pad = (s: string) => {
      while (s.length < 150) s += "次の練習でも、今回の良かった点を意識しながら、内容と表現の両方を少しずつ磨いていきましょう。";
      return s.slice(0, 200);
    };
    return {
      goodPoints: pad(
        `内容面では、論題「${input.motion}」に対して自分の主張を理由とともに述べられた点が良かったです。表現面では、規定時間を意識してスピーチを最後まで続けられたこと、聞き手に伝えようとする姿勢が見られたことが評価できます。`,
      ),
      improvementPoints: pad(
        input.nextLevel?.targetLevel
          ? `${input.nextLevel.targetLevel}に上がるには、内容${input.nextLevel.requirements?.matter}点・表現${input.nextLevel.requirements?.manner}点が必要です。特に「${input.nextLevel.keyActions[0] ?? "理由の説明"}」を意識して練習しましょう。表現面ではアイコンタクトと声の緩急も効果的です。`
          : `内容面では、主張の理由をもう一段深く説明し、具体例を聞き手が想像できるくらい詳しく描写するとさらに良くなります。表現面では、アイコンタクトの時間を増やし、声の大きさやスピードに緩急をつけると、聞き手を惹きつけるスピーチになります。`,
      ),
      overallComments: pad(
        `今回の結果は 内容${input.matterScore}点・表現${input.mannerScore}点${input.pdLevel ? `、PD Level ${input.pdLevel}` : ""} でした。${input.nextLevel?.targetLevel ? `次の目標は ${input.nextLevel.targetLevel} です。` : "最上位レベルです。この調子で磨き続けましょう。"}主張と理由の骨組みを保ちながら、レポートの「次のレベルへのプラン」の項目を1つずつ練習しましょう。`,
      ),
    };
  }

  async generatePmSpeech(input: { motion: string; language: Lang }): Promise<GeneratedSpeechOutput> {
    return {
      script: SAMPLE_PM_SPEECH(input.motion),
      structure: {
        definition: "we propose this policy for all people in our society, starting next year",
        gov_point_1: "This policy protects people's health and safety.",
        gov_point_2: "This policy makes our society fairer for everyone.",
        gov_point_1_detail: "Health and safety are the foundation; only the government side removes the harm.",
      },
      model: "mock-judge",
      promptVersion: PM_SPEECH_PROMPT_VERSION,
    };
  }
}

export { COMMENTS_PROMPT_VERSION };
