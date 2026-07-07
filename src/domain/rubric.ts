import type { RubricDefinition } from "./types";

/**
 * PDA公式ルーブリック「評価基準_ルーブリック（PD検定対応）.xlsx」の機械可読表現。
 *
 * ここに書かれた文言は Excel の原文からの転記であり、システム内の唯一の採点根拠となる。
 * 文言の変更・追加は必ず新しい version として登録し、既存の評価には過去バージョンを使い続けること。
 *
 * AIはこの詳細項目の充足（true/false）判定のみを行い、点数計算は rubricEngine が行う。
 */
export const RUBRIC_2020_07_10_V1: RubricDefinition = {
  version: "2020-07-10.v1",

  matterGates: [
    { score: 0, id: "matter.gate0", text: "一言も発しない。" },
    {
      score: 1,
      id: "matter.gate1",
      text: "論点［争点］を提示しておらず、ほとんど何も言っていない。（挨拶、論題の提示のみを行う。）",
    },
    {
      score: 2,
      id: "matter.gate2",
      text: "論点［争点］を提示するにとどまり、詳細の説明がない。（挨拶、論題の提示、論点（サインポスト）の提示のみを行う。）",
    },
  ],

  mannerGates: [
    { score: 0, id: "manner.gate0", text: "前に出ない。（一切スピーチを行わない。）" },
    { score: 1, id: "manner.gate1", text: "ほとんど聞こえない。" },
    {
      score: 2,
      id: "manner.gate2",
      text: "とても聞きづらい。（ところどころ英単語は確認できる。）",
    },
  ],

  items: [
    // ─────────────── 内容（Matter） ───────────────
    {
      key: "reasoning",
      category: "matter",
      labelJa: "主張の理由",
      labelEn: "Reasoning",
      criteria: [
        {
          id: "matter.reasoning.B1",
          band: "B",
          text: "主張に対して1段階の理由づけがある。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.reasoning.A1",
          band: "A",
          text: "主張に対して聴衆が想像できる程度に理由の説明をしている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.reasoning.S1",
          band: "S",
          text: "肯定側と否定側の差を説明する理由づけをしている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.reasoning.S2",
          band: "S",
          text: "主張［・争点］の重要性を述べている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.reasoning.S3",
          band: "S",
          text: "主張の理由が複数ある。",
          applicability: "always",
          judge: "llm",
        },
      ],
    },
    {
      key: "example",
      category: "matter",
      labelJa: "具体例",
      labelEn: "Example",
      criteria: [
        {
          id: "matter.example.B1",
          band: "B",
          text: "主張やその理由づけに対応する例をキーワード程度説明している。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.example.A1",
          band: "A",
          text: "主張やその理由づけに対応する例・描写を、聴衆が想像できる程度に説明している。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.example.S1",
          band: "S",
          text: "主張やその理由づけに、固有な例・描写を説明している。",
          replyText: "争点・主張に固有な例・描写を提示または再提示している。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.example.S2",
          band: "S",
          text: "主張や理由づけに、一般化した例・描写を提示している。",
          replyText: "争点・主張に一般化した例・描写を提示または再提示している。",
          applicability: "always",
          judge: "llm",
        },
      ],
    },
    {
      key: "relevancy",
      category: "matter",
      labelJa: "論題との関連性",
      labelEn: "Relevancy",
      criteria: [
        {
          id: "matter.relevancy.B1",
          band: "B",
          text: "主張と論題の関連性が認められる。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.relevancy.A1",
          band: "A",
          text: "主張が論題の肯定・否定に直接的につながっている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.relevancy.S1",
          band: "S",
          text: "論題に書かれているキーワードの固有性に基づいてポイントを立て、理由を説明している。",
          replyText: "論題に書かれているキーワードに固有な争点・主張を設定し、まとめている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.relevancy.S2",
          band: "S",
          text: "論題から派生するキーワード・論題から影響を受ける対象の固有性に基づいてポイントを立て、理由を説明している。",
          replyText: "論題から派生するキーワード・論題から影響を受ける対象に固有な争点を設定し、まとめている。",
          applicability: "always",
          judge: "llm",
        },
      ],
    },
    {
      key: "role_strategy",
      category: "matter",
      labelJa: "スピーカーの役割・戦略性",
      labelEn: "Role and Strategy",
      criteria: [
        {
          id: "matter.role_strategy.B1",
          band: "B",
          text: "各スピーカーに求められる立論・反論・再構築・比較などの役割を一部満たしている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.role_strategy.A1",
          band: "A",
          text: "各スピーカーに求められる立論・反論・再構築・比較・サインポスト（ポイントのタイトル）の提示などの役割を満たしている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.role_strategy.S1",
          band: "S",
          text: "スピーカーの役割に基づいた戦略的な立ち回りができている。（争点の整理をしている。争点を踏まえた立論や反論、再構築、まとめをしている。聴衆を惹きつけるような工夫をしている。など）",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.role_strategy.S2",
          band: "S",
          text: "わかりやすいスピーチにするための工夫がみられる。（サブポイントを明確にしている。など）",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "matter.role_strategy.S3",
          band: "S",
          text: "POIを使って、質問または返答をし、議論を強化している。",
          applicability: "poi_available",
          judge: "llm",
        },
      ],
    },

    // ─────────────── 表現（Manner） ───────────────
    {
      key: "attitude",
      category: "manner",
      labelJa: "態度・話す姿勢",
      labelEn: "Attitude",
      criteria: [
        {
          id: "manner.attitude.B1",
          band: "B",
          text: "スピーチ中の沈黙が半分以下である。",
          applicability: "always",
          judge: "metric",
          metricKey: "silence_ratio_half",
        },
        {
          id: "manner.attitude.A1",
          band: "A",
          text: "沈黙がほとんど見られず、正しい姿勢（肘をつく・片足に重心をかけるなどがない）で、相手や聴衆に対して敬意を持ってスピーチしている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "manner.attitude.A2",
          band: "A",
          text: "POIを1回以上、受けている。（ただし、相手側からのPOIが1回以下の場合を除く。）",
          applicability: "poi_available_exception",
          judge: "llm",
        },
        {
          id: "manner.attitude.S1",
          band: "S",
          text: "自信を持ち、落ち着いてスピーチをしている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "manner.attitude.S2",
          band: "S",
          text: "相手スピーチ中に積極的にPOIに立ち、議論を深めようとするやり取りが見られる。",
          applicability: "poi_available",
          judge: "llm",
        },
      ],
    },
    {
      key: "eye_contact_gesture",
      category: "manner",
      labelJa: "アイコンタクト・ジェスチャー",
      labelEn: "Eye Contact and Gestures",
      criteria: [
        {
          id: "manner.eye_contact_gesture.B1",
          band: "B",
          text: "下を向いていることが多いものの、意識的に聴衆を見ようとしている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "manner.eye_contact_gesture.A1",
          band: "A",
          text: "挨拶やサインポストなどの重要箇所を含むスピーチの半分程度でアイコンタクトをし、聴衆を惹きつけている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "manner.eye_contact_gesture.S1",
          band: "S",
          text: "下を向く時間がメモを確認する程度でほとんどなく、スピーチの大部分においてアイコンタクトをし、聴衆を惹きつけている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "manner.eye_contact_gesture.S2",
          band: "S",
          text: "スピーチ内容に合わせたジェスチャーを意図的かつ効果的にしている。",
          applicability: "always",
          judge: "llm",
        },
      ],
    },
    {
      key: "clarity",
      category: "manner",
      labelJa: "明瞭性",
      labelEn: "Clarity",
      criteria: [
        {
          id: "manner.clarity.B1",
          band: "B",
          text: "聞こえないところが一部あるが、聴衆に伝わる声の大きさとなっている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "manner.clarity.A1",
          band: "A",
          text: "スピーチ全体を通して、聴衆に伝わる声の大きさ・スピードに調整している。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "manner.clarity.S1",
          band: "S",
          text: "声の大きさやスピードの緩急に工夫が見られる。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "manner.clarity.S2",
          band: "S",
          text: "感情をこめたスピーチをしている。",
          applicability: "always",
          judge: "llm",
        },
        {
          id: "manner.clarity.S3",
          band: "S",
          text: "淀みなくスピーチをしている。",
          applicability: "always",
          judge: "llm",
        },
      ],
    },
    {
      key: "time_management",
      category: "manner",
      labelJa: "タイムマネジメント",
      labelEn: "Time Management",
      criteria: [
        {
          id: "manner.time_management.B1",
          band: "B",
          text: "規定時間の半分以上（PM～MOは1:30以上、LOR～PMRは1:00以上）、スピーチしている。",
          applicability: "always",
          judge: "metric",
          metricKey: "time_b",
        },
        {
          id: "manner.time_management.A1",
          band: "A",
          text: "規定の許容範囲時間以上（PM～MOは2:30以上、LOR～PMRは1:30以上）、スピーチしている。",
          applicability: "always",
          judge: "metric",
          metricKey: "time_a",
        },
        {
          id: "manner.time_management.S1",
          band: "S",
          text: "規定の許容範囲時間内（PM～MOは3:30以内、LOR～PMRは2:30以内）にスピーチを完了している。",
          applicability: "always",
          judge: "metric",
          metricKey: "time_s",
        },
      ],
    },
  ],
};

/** The rubric version used for new assessments unless configured otherwise. */
export const DEFAULT_RUBRIC = RUBRIC_2020_07_10_V1;

export function findCriterion(rubric: RubricDefinition, criterionId: string) {
  for (const item of rubric.items) {
    const c = item.criteria.find((c) => c.id === criterionId);
    if (c) return { item, criterion: c };
  }
  return null;
}
