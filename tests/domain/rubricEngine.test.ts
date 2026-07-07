import { describe, it, expect } from "vitest";
import { DEFAULT_RUBRIC } from "@/src/domain/rubric";
import { computeScore, categoryGradeForScore } from "@/src/domain/rubricEngine";
import type {
  CriterionJudgment,
  GateJudgment,
  ScoringContext,
} from "@/src/domain/types";

const SOLO: ScoringContext = { speechType: "constructive", poiAvailable: false };
const TEAM: ScoringContext = { speechType: "constructive", poiAvailable: true };
const NO_GATES: GateJudgment[] = [
  { category: "matter", gateId: null },
  { category: "manner", gateId: null },
];

/** Build judgments by listing the criterion ids that are met; all others false. */
function met(ids: string[]): CriterionJudgment[] {
  const all: CriterionJudgment[] = [];
  for (const item of DEFAULT_RUBRIC.items) {
    for (const c of item.criteria) {
      all.push({ criterionId: c.id, met: ids.includes(c.id), source: "llm" });
    }
  }
  return all;
}

const MATTER_B = [
  "matter.reasoning.B1",
  "matter.example.B1",
  "matter.relevancy.B1",
  "matter.role_strategy.B1",
];
const MATTER_A = [
  "matter.reasoning.A1",
  "matter.example.A1",
  "matter.relevancy.A1",
  "matter.role_strategy.A1",
];
const MANNER_B = [
  "manner.attitude.B1",
  "manner.eye_contact_gesture.B1",
  "manner.clarity.B1",
  "manner.time_management.B1",
];
const MANNER_A = [
  "manner.attitude.A1",
  "manner.eye_contact_gesture.A1",
  "manner.clarity.A1",
  "manner.time_management.A1",
];

function score(ids: string[], ctx: ScoringContext = SOLO, gates = NO_GATES) {
  return computeScore({
    rubric: DEFAULT_RUBRIC,
    context: ctx,
    judgments: met(ids),
    gates,
  });
}

describe("低得点ゲート（C帯）", () => {
  it.each([
    ["matter.gate0", 0],
    ["matter.gate1", 1],
    ["matter.gate2", 2],
  ])("内容ゲート %s → %d点・グレードC", (gateId, expected) => {
    const r = score([...MATTER_B, ...MATTER_A], SOLO, [
      { category: "matter", gateId },
      { category: "manner", gateId: null },
    ]);
    expect(r.matter.score).toBe(expected);
    expect(r.matter.grade).toBe("C");
    expect(r.matter.band).toBe("gate");
    expect(r.matter.items.every((i) => i.grade === "C")).toBe(true);
  });

  it.each([
    ["manner.gate0", 0],
    ["manner.gate1", 1],
    ["manner.gate2", 2],
  ])("表現ゲート %s → %d点", (gateId, expected) => {
    const r = score([], SOLO, [
      { category: "matter", gateId: null },
      { category: "manner", gateId },
    ]);
    expect(r.manner.score).toBe(expected);
    expect(r.manner.grade).toBe("C");
  });

  it("ゲート非該当かつB充足0項目 → 2点（提示のみ相当）", () => {
    const r = score([]);
    expect(r.matter.score).toBe(2);
    expect(r.matter.grade).toBe("C");
    expect(r.manner.score).toBe(2);
  });
});

describe("B帯（3〜5点）: 充足項目数 1〜2→3点 / 3→4点 / 4→5点", () => {
  it("B充足1項目 → 3点", () => {
    expect(score(["matter.reasoning.B1"]).matter.score).toBe(3);
  });
  it("B充足2項目 → 3点", () => {
    expect(score(["matter.reasoning.B1", "matter.example.B1"]).matter.score).toBe(3);
  });
  it("B充足3項目 → 4点", () => {
    expect(
      score(["matter.reasoning.B1", "matter.example.B1", "matter.relevancy.B1"]).matter.score,
    ).toBe(4);
  });
  it("B充足4項目（A未達）→ 5点・グレードB", () => {
    const r = score(MATTER_B);
    expect(r.matter.score).toBe(5);
    expect(r.matter.grade).toBe("B");
  });
  it("A充足3項目のみ（1項目がA未達）→ 5点にとどまる", () => {
    const r = score([...MATTER_B, ...MATTER_A.slice(0, 3)]);
    expect(r.matter.score).toBe(5);
  });
});

describe("A帯（6点）: 4項目すべてのA基準充足", () => {
  it("内容: B+A全充足 → 6点・グレードA", () => {
    const r = score([...MATTER_B, ...MATTER_A]);
    expect(r.matter.score).toBe(6);
    expect(r.matter.grade).toBe("A");
    expect(r.matter.items.every((i) => i.grade === "A")).toBe(true);
  });

  it("表現（1人受験）: POI例外規定によりattitude.A2免除でA帯到達", () => {
    // manner.attitude.A2 (POIを1回以上受けている) は相手POIが無い場合の除外規定を適用
    const r = score([...MANNER_B, ...MANNER_A], SOLO);
    expect(r.manner.score).toBe(6);
  });

  it("表現（チーム戦）: attitude.A2未充足ならA帯に到達しない", () => {
    const r = score([...MANNER_B, ...MANNER_A], TEAM);
    expect(r.manner.score).toBe(5);
  });

  it("表現（チーム戦）: attitude.A2充足でA帯到達", () => {
    const r = score([...MANNER_B, ...MANNER_A, "manner.attitude.A2"], TEAM);
    expect(r.manner.score).toBe(6);
  });
});

describe("S帯（7〜10点）: 特に評価できる項目数で加点", () => {
  const base = [...MATTER_B, ...MATTER_A];

  it("reasoning: S詳細3件中1件のみ → 特に評価できるに該当せず6点", () => {
    const r = score([...base, "matter.reasoning.S1"]);
    expect(r.matter.score).toBe(6);
    expect(r.matter.items.find((i) => i.key === "reasoning")!.grade).toBe("A");
  });

  it("reasoning: S詳細3件中2件（半分以上）→ 7点・項目グレードS", () => {
    const r = score([...base, "matter.reasoning.S1", "matter.reasoning.S2"]);
    expect(r.matter.score).toBe(7);
    expect(r.matter.grade).toBe("S");
    expect(r.matter.items.find((i) => i.key === "reasoning")!.grade).toBe("S");
  });

  it("example: S詳細2件中1件（半分以上）→ 特に評価できる", () => {
    const r = score([...base, "matter.example.S1"]);
    expect(r.matter.score).toBe(7);
  });

  it("特に評価できる2項目 → 8点 / 3項目 → 9点 / 4項目 → 10点", () => {
    const two = score([...base, "matter.example.S1", "matter.relevancy.S1"]);
    expect(two.matter.score).toBe(8);

    const three = score([
      ...base,
      "matter.example.S1",
      "matter.relevancy.S1",
      "matter.reasoning.S1",
      "matter.reasoning.S3",
    ]);
    expect(three.matter.score).toBe(9);

    const four = score([
      ...base,
      "matter.example.S1",
      "matter.relevancy.S1",
      "matter.reasoning.S1",
      "matter.reasoning.S3",
      "matter.role_strategy.S1",
    ]);
    expect(four.matter.score).toBe(10);
    expect(four.matter.items.every((i) => i.grade === "S")).toBe(true);
  });

  it("A帯未達ならS詳細を満たしても6点に到達しない", () => {
    const r = score([...MATTER_B, "matter.reasoning.S1", "matter.reasoning.S2"]);
    expect(r.matter.score).toBe(5);
  });
});

describe("POI関連S詳細項目の分母除外（1人受験）", () => {
  const base = [...MATTER_B, ...MATTER_A];

  it("role_strategy: 1人受験ではS詳細2件中1件で特に評価できる", () => {
    // S3 (POI) が分母から除外され、S1/S2 の2件中1件充足で半分以上
    const r = score([...base, "matter.role_strategy.S1"], SOLO);
    expect(r.matter.score).toBe(7);
    const item = r.matter.items.find((i) => i.key === "role_strategy")!;
    expect(item.sApplicableCount).toBe(2);
    expect(item.especiallyCommendable).toBe(true);
  });

  it("role_strategy: チーム戦ではS詳細3件中1件では足りない", () => {
    const r = score([...base, "matter.role_strategy.S1"], TEAM);
    expect(r.matter.score).toBe(6);
    const item = r.matter.items.find((i) => i.key === "role_strategy")!;
    expect(item.sApplicableCount).toBe(3);
    expect(item.especiallyCommendable).toBe(false);
  });

  it("attitude: 1人受験ではS詳細はS1のみが分母（S2=POIは除外）", () => {
    const r = score([...MANNER_B, ...MANNER_A, "manner.attitude.S1"], SOLO);
    expect(r.manner.score).toBe(7);
    const item = r.manner.items.find((i) => i.key === "attitude")!;
    expect(item.sApplicableCount).toBe(1);
  });
});

describe("項目別グレード", () => {
  it("B未充足の項目はA/S詳細を満たしてもC（帯域は積み上げ）", () => {
    const r = score(["matter.reasoning.A1", "matter.reasoning.S1", "matter.reasoning.S2"]);
    expect(r.matter.items.find((i) => i.key === "reasoning")!.grade).toBe("C");
  });
});

describe("合計・細目表記", () => {
  it("細目表記: 0-2=C / 3-5=B / 6=A / 7-10=S", () => {
    expect(categoryGradeForScore(0)).toBe("C");
    expect(categoryGradeForScore(2)).toBe("C");
    expect(categoryGradeForScore(3)).toBe("B");
    expect(categoryGradeForScore(5)).toBe("B");
    expect(categoryGradeForScore(6)).toBe("A");
    expect(categoryGradeForScore(7)).toBe("S");
    expect(categoryGradeForScore(10)).toBe("S");
  });

  it("total = matter + manner", () => {
    const r = score([...MATTER_B, ...MATTER_A, ...MANNER_B]);
    expect(r.matter.score).toBe(6);
    expect(r.manner.score).toBe(5);
    expect(r.total).toBe(11);
  });
});
