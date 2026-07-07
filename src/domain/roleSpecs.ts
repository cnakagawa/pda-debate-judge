import type { RoleSpec, TimeLimits } from "./types";

/**
 * 役割定義（スピーチシート・ディベートのルールに基づく）。
 * DBシードの元データであり、新しい役割の追加はここ（とシード）への追加のみで完結する。
 */

/** PM〜MO（立論系スピーチ）: 規定3:00、許容範囲 2:30〜3:30 */
export const CONSTRUCTIVE_TIME_LIMITS: TimeLimits = {
  regulation: 180,
  minHalf: 90,
  aMin: 150,
  graceMax: 210,
};

/** LOR・PMR（リプライスピーチ）: 規定2:00、許容範囲 1:30〜2:30 */
export const REPLY_TIME_LIMITS: TimeLimits = {
  regulation: 120,
  minHalf: 60,
  aMin: 90,
  graceMax: 150,
};

export const ROLE_SPECS: RoleSpec[] = [
  {
    role: "PM",
    side: "government",
    speechType: "constructive",
    labelJa: "PM（Prime Minister / 肯定側第一スピーカー）",
    timeLimits: CONSTRUCTIVE_TIME_LIMITS,
    requiredElements: [
      { key: "definition", labelJa: "定義（必要な場合）", labelEn: "Definition (if needed)", optional: true },
      { key: "gov_point_1", labelJa: "Government Point 1", labelEn: "Government Point 1" },
      { key: "gov_point_2", labelJa: "Government Point 2", labelEn: "Government Point 2" },
      { key: "gov_point_1_detail", labelJa: "Government Point 1 の詳しい説明", labelEn: "Detailed explanation of Government Point 1" },
    ],
    inputs: [],
    enabled: true,
  },
  {
    role: "LO",
    side: "opposition",
    speechType: "constructive",
    labelJa: "LO（Leader of Opposition / 否定側第一スピーカー）",
    timeLimits: CONSTRUCTIVE_TIME_LIMITS,
    requiredElements: [
      { key: "rebuttal_gov_point_1", labelJa: "Government Point 1 への反論", labelEn: "Rebuttal to Government Point 1" },
      { key: "opp_point_1", labelJa: "Opposition Point 1", labelEn: "Opposition Point 1" },
      { key: "opp_point_2", labelJa: "Opposition Point 2", labelEn: "Opposition Point 2" },
      { key: "opp_point_1_detail", labelJa: "Opposition Point 1 の詳しい説明", labelEn: "Detailed explanation of Opposition Point 1" },
    ],
    inputs: [{ role: "PM", kind: "generated_speech" }],
    enabled: true,
  },
  // ────────── 第2フェーズで有効化する役割（定義済み・enabled: false） ──────────
  {
    role: "MG",
    side: "government",
    speechType: "constructive",
    labelJa: "MG（Member of Government / 肯定側第二スピーカー）",
    timeLimits: CONSTRUCTIVE_TIME_LIMITS,
    requiredElements: [
      { key: "rebuttal_opp", labelJa: "否定側ポイントへの反論", labelEn: "Rebuttal to Opposition points" },
      { key: "rebuild_gov", labelJa: "肯定側ポイントの再構築", labelEn: "Rebuilding Government points" },
      { key: "gov_point_new", labelJa: "新しいポイントまたは深掘り", labelEn: "New point or deeper analysis" },
    ],
    inputs: [
      { role: "PM", kind: "generated_speech" },
      { role: "LO", kind: "generated_speech" },
    ],
    enabled: false,
  },
  {
    role: "MO",
    side: "opposition",
    speechType: "constructive",
    labelJa: "MO（Member of Opposition / 否定側第二スピーカー）",
    timeLimits: CONSTRUCTIVE_TIME_LIMITS,
    requiredElements: [
      { key: "rebuttal_gov", labelJa: "肯定側ポイントへの反論", labelEn: "Rebuttal to Government points" },
      { key: "rebuild_opp", labelJa: "否定側ポイントの再構築", labelEn: "Rebuilding Opposition points" },
      { key: "opp_point_new", labelJa: "新しいポイントまたは深掘り", labelEn: "New point or deeper analysis" },
    ],
    inputs: [
      { role: "PM", kind: "generated_speech" },
      { role: "LO", kind: "generated_speech" },
      { role: "MG", kind: "generated_speech" },
    ],
    enabled: false,
  },
  {
    role: "LOR",
    side: "opposition",
    speechType: "reply",
    labelJa: "LOR（Leader of Opposition Reply / 否定側リプライ）",
    timeLimits: REPLY_TIME_LIMITS,
    requiredElements: [
      { key: "issues", labelJa: "争点の整理", labelEn: "Summary of clashes" },
      { key: "comparison", labelJa: "肯定側・否定側の比較", labelEn: "Comparison of both sides" },
      { key: "why_opp_wins", labelJa: "否定側が勝っている理由", labelEn: "Why Opposition wins" },
    ],
    inputs: [
      { role: "PM", kind: "generated_speech" },
      { role: "LO", kind: "generated_speech" },
      { role: "MG", kind: "generated_speech" },
      { role: "MO", kind: "generated_speech" },
    ],
    enabled: false,
  },
  {
    role: "PMR",
    side: "government",
    speechType: "reply",
    labelJa: "PMR（Prime Minister Reply / 肯定側リプライ）",
    timeLimits: REPLY_TIME_LIMITS,
    requiredElements: [
      { key: "issues", labelJa: "争点の整理", labelEn: "Summary of clashes" },
      { key: "comparison", labelJa: "肯定側・否定側の比較", labelEn: "Comparison of both sides" },
      { key: "why_gov_wins", labelJa: "肯定側が勝っている理由", labelEn: "Why Government wins" },
    ],
    inputs: [
      { role: "PM", kind: "generated_speech" },
      { role: "LO", kind: "generated_speech" },
      { role: "MG", kind: "generated_speech" },
      { role: "MO", kind: "generated_speech" },
    ],
    enabled: false,
  },
];

export function roleSpecFor(role: string): RoleSpec {
  const spec = ROLE_SPECS.find((r) => r.role === role);
  if (!spec) throw new Error(`Unknown debate role: ${role}`);
  return spec;
}
