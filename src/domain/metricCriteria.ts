import type { CriterionJudgment, DeliveryMetrics, RubricDefinition, TimeLimits } from "./types";

/**
 * 計測値から決定的に判定できる詳細項目（judge === "metric"）の充足判定。
 * タイムマネジメント（B/A/S）と「沈黙が半分以下」はLLMを使わずここで確定する。
 */
export function judgeMetricCriteria(
  rubric: RubricDefinition,
  metrics: DeliveryMetrics,
  timeLimits: TimeLimits,
): CriterionJudgment[] {
  const judgments: CriterionJudgment[] = [];
  const d = metrics.speechDurationSec;
  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

  for (const item of rubric.items) {
    for (const c of item.criteria) {
      if (c.judge !== "metric") continue;
      switch (c.metricKey) {
        case "silence_ratio_half":
          judgments.push({
            criterionId: c.id,
            met: metrics.silenceRatio <= 0.5,
            confidence: 1,
            rationale: `沈黙率 ${(metrics.silenceRatio * 100).toFixed(0)}%（計測値）`,
            source: "metric",
          });
          break;
        case "time_b":
          judgments.push({
            criterionId: c.id,
            met: d >= timeLimits.minHalf,
            confidence: 1,
            rationale: `スピーチ時間 ${fmt(d)}（基準 ${fmt(timeLimits.minHalf)} 以上）`,
            source: "metric",
          });
          break;
        case "time_a":
          judgments.push({
            criterionId: c.id,
            met: d >= timeLimits.aMin,
            confidence: 1,
            rationale: `スピーチ時間 ${fmt(d)}（基準 ${fmt(timeLimits.aMin)} 以上）`,
            source: "metric",
          });
          break;
        case "time_s":
          // S: 許容範囲時間内に完了（下限はA基準で担保されるため上限のみ判定）
          judgments.push({
            criterionId: c.id,
            met: d <= timeLimits.graceMax,
            confidence: 1,
            rationale: `スピーチ時間 ${fmt(d)}（許容上限 ${fmt(timeLimits.graceMax)} 以内）`,
            source: "metric",
          });
          break;
        default:
          throw new Error(`Metric criterion ${c.id} has unknown metricKey: ${c.metricKey}`);
      }
    }
  }
  return judgments;
}
