import { describe, it, expect } from "vitest";
import { DEFAULT_RUBRIC } from "@/src/domain/rubric";
import { computeScore } from "@/src/domain/rubricEngine";
import { buildNextLevelPlan } from "@/src/domain/nextLevelPlan";
import type { CriterionJudgment, GateJudgment, ScoringContext } from "@/src/domain/types";

const SOLO: ScoringContext = { speechType: "constructive", poiAvailable: false };
const NO_GATES: GateJudgment[] = [
  { category: "matter", gateId: null },
  { category: "manner", gateId: null },
];

function met(ids: string[]): CriterionJudgment[] {
  const all: CriterionJudgment[] = [];
  for (const item of DEFAULT_RUBRIC.items) {
    for (const c of item.criteria) {
      all.push({ criterionId: c.id, met: ids.includes(c.id), source: "llm" });
    }
  }
  return all;
}

const MATTER_B = ["matter.reasoning.B1", "matter.example.B1", "matter.relevancy.B1", "matter.role_strategy.B1"];
const MATTER_A = ["matter.reasoning.A1", "matter.example.A1", "matter.relevancy.A1", "matter.role_strategy.A1"];
const MANNER_B = ["manner.attitude.B1", "manner.eye_contact_gesture.B1", "manner.clarity.B1", "manner.time_management.B1"];
const MANNER_A = ["manner.attitude.A1", "manner.eye_contact_gesture.A1", "manner.clarity.A1", "manner.time_management.A1"];

function plan(ids: string[]) {
  const score = computeScore({ rubric: DEFAULT_RUBRIC, context: SOLO, judgments: met(ids), gates: NO_GATES });
  return { score, plan: buildNextLevelPlan(score, DEFAULT_RUBRIC, SOLO, score.pdLevel as never) };
}

describe("NextLevelPlan（成長方向はPD5→PD4→…→PD1）", () => {
  it("判定外（0点台）の場合はまずPD5（内容3・表現3）を目標にする", () => {
    const { plan: p } = plan([]);
    expect(p.targetLevel).toBe("PD5");
    expect(p.requirements).toEqual({ matter: 3, manner: 3 });
    expect(p.gaps.matter).toBeGreaterThan(0);
    // 推奨はB帯のルーブリック原文のみ
    expect(p.recommendations.every((r) => r.band === "B")).toBe(true);
    expect(p.recommendations.some((r) => r.text.includes("1段階の理由づけ"))).toBe(true);
  });

  it("PD5（3-5点帯）→ 目標PD4: 不足カテゴリのB項目を提示", () => {
    const { score, plan: p } = plan([...MATTER_B, "manner.attitude.B1", "manner.clarity.B1"]);
    expect(score.matter.score).toBe(5);
    expect(score.manner.score).toBe(3);
    expect(score.pdLevel).toBe("PD5");
    expect(p.targetLevel).toBe("PD4");
    expect(p.gaps).toEqual({ matter: 0, manner: 2 });
    // 表現の未充足B項目のみが推奨される
    expect(p.recommendations.every((r) => r.category === "manner")).toBe(true);
    const keys = p.recommendations.map((r) => r.criterionId);
    expect(keys).toContain("manner.eye_contact_gesture.B1");
    expect(keys).toContain("manner.time_management.B1");
  });

  it("PD4（5点・5点）→ 目標PD3: A帯項目を提示", () => {
    const { score, plan: p } = plan([...MATTER_B, ...MANNER_B]);
    expect(score.pdLevel).toBe("PD4");
    expect(p.targetLevel).toBe("PD3");
    expect(p.requirements).toEqual({ matter: 6, manner: 6 });
    expect(p.recommendations.some((r) => r.band === "A")).toBe(true);
    // POI例外（attitude.A2）は1人受験の推奨に含まれない
    expect(p.recommendations.every((r) => r.criterionId !== "manner.attitude.A2")).toBe(true);
  });

  it("PD3（6点・6点）→ 目標PD2: S詳細項目を必要数ぶん提示", () => {
    const { score, plan: p } = plan([...MATTER_B, ...MATTER_A, ...MANNER_B, ...MANNER_A]);
    expect(score.matter.score).toBe(6);
    expect(score.manner.score).toBe(6);
    expect(score.pdLevel).toBe("PD3");
    expect(p.targetLevel).toBe("PD2");
    expect(p.recommendations.length).toBeGreaterThan(0);
    expect(p.recommendations.every((r) => r.band === "S")).toBe(true);
    // POI前提のS項目は含まれない
    expect(p.recommendations.every((r) => !r.criterionId.endsWith("role_strategy.S3"))).toBe(true);
    expect(p.recommendations.every((r) => !r.criterionId.endsWith("attitude.S2"))).toBe(true);
  });

  it("PD1（9点以上・9点以上）は目標なし（最上位到達）", () => {
    const ids = [
      ...MATTER_B, ...MATTER_A, ...MANNER_B, ...MANNER_A,
      "matter.reasoning.S1", "matter.reasoning.S2",
      "matter.example.S1", "matter.relevancy.S1",
      "manner.attitude.S1", "manner.eye_contact_gesture.S1",
      "manner.clarity.S1", "manner.clarity.S2", "manner.time_management.S1",
    ];
    const { score, plan: p } = plan(ids);
    expect(score.pdLevel).toBe("PD1");
    expect(p.targetLevel).toBeNull();
    expect(p.recommendations).toHaveLength(0);
  });

  it("推奨はすべてルーブリック原文（textが定義に存在する）", () => {
    const { plan: p } = plan([...MATTER_B, ...MANNER_B]);
    const allTexts = DEFAULT_RUBRIC.items.flatMap((i) => i.criteria.map((c) => c.text));
    expect(p.recommendations.every((r) => allTexts.includes(r.text))).toBe(true);
  });
});
