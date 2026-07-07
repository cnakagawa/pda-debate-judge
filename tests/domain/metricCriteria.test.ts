import { describe, it, expect } from "vitest";
import { DEFAULT_RUBRIC } from "@/src/domain/rubric";
import { judgeMetricCriteria } from "@/src/domain/metricCriteria";
import { CONSTRUCTIVE_TIME_LIMITS, REPLY_TIME_LIMITS } from "@/src/domain/roleSpecs";
import type { DeliveryMetrics } from "@/src/domain/types";

function metrics(overrides: Partial<DeliveryMetrics>): DeliveryMetrics {
  return {
    speechDurationSec: 180,
    silenceRatio: 0.1,
    longestSilenceSec: 2,
    wordsPerMinute: 150,
    eyeContactRatio: 0.6,
    framesAnalyzed: 90,
    ...overrides,
  };
}

function judgmentFor(id: string, m: DeliveryMetrics, reply = false) {
  const js = judgeMetricCriteria(
    DEFAULT_RUBRIC,
    m,
    reply ? REPLY_TIME_LIMITS : CONSTRUCTIVE_TIME_LIMITS,
  );
  const j = js.find((j) => j.criterionId === id);
  if (!j) throw new Error(`no judgment for ${id}`);
  return j;
}

describe("タイムマネジメント（PM〜MO: 1:30 / 2:30 / 3:30）", () => {
  it("B: 1:30以上", () => {
    expect(judgmentFor("manner.time_management.B1", metrics({ speechDurationSec: 89 })).met).toBe(false);
    expect(judgmentFor("manner.time_management.B1", metrics({ speechDurationSec: 90 })).met).toBe(true);
  });
  it("A: 2:30以上", () => {
    expect(judgmentFor("manner.time_management.A1", metrics({ speechDurationSec: 149 })).met).toBe(false);
    expect(judgmentFor("manner.time_management.A1", metrics({ speechDurationSec: 150 })).met).toBe(true);
  });
  it("S: 3:30以内に完了", () => {
    expect(judgmentFor("manner.time_management.S1", metrics({ speechDurationSec: 210 })).met).toBe(true);
    expect(judgmentFor("manner.time_management.S1", metrics({ speechDurationSec: 211 })).met).toBe(false);
  });
});

describe("タイムマネジメント（LOR〜PMR: 1:00 / 1:30 / 2:30）", () => {
  it("Reply の閾値が適用される", () => {
    expect(judgmentFor("manner.time_management.B1", metrics({ speechDurationSec: 60 }), true).met).toBe(true);
    expect(judgmentFor("manner.time_management.B1", metrics({ speechDurationSec: 59 }), true).met).toBe(false);
    expect(judgmentFor("manner.time_management.A1", metrics({ speechDurationSec: 90 }), true).met).toBe(true);
    expect(judgmentFor("manner.time_management.S1", metrics({ speechDurationSec: 150 }), true).met).toBe(true);
    expect(judgmentFor("manner.time_management.S1", metrics({ speechDurationSec: 151 }), true).met).toBe(false);
  });
});

describe("沈黙率（態度B: 沈黙が半分以下）", () => {
  it("50%以下でmet", () => {
    expect(judgmentFor("manner.attitude.B1", metrics({ silenceRatio: 0.5 })).met).toBe(true);
    expect(judgmentFor("manner.attitude.B1", metrics({ silenceRatio: 0.51 })).met).toBe(false);
  });
  it("すべてsource=metricで根拠つき", () => {
    const js = judgeMetricCriteria(DEFAULT_RUBRIC, metrics({}), CONSTRUCTIVE_TIME_LIMITS);
    expect(js).toHaveLength(4);
    for (const j of js) {
      expect(j.source).toBe("metric");
      expect(j.rationale).toBeTruthy();
    }
  });
});
