import type { SttWord } from "../ports";
import type { DeliveryMetrics } from "../domain/types";

/**
 * 文字起こしの単語タイムスタンプから表現（Manner）の計測値を決定的に算出する。
 * ここの値がタイムマネジメント・沈黙率の判定（metric criteria）の一次情報になる。
 */
export function computeDeliveryMetrics(
  words: SttWord[],
  recordingDurationSec: number,
): Pick<
  DeliveryMetrics,
  "speechDurationSec" | "silenceRatio" | "longestSilenceSec" | "wordsPerMinute"
> {
  if (words.length === 0) {
    return {
      speechDurationSec: 0,
      silenceRatio: 1,
      longestSilenceSec: recordingDurationSec,
      wordsPerMinute: 0,
    };
  }

  const first = words[0]!;
  const last = words[words.length - 1]!;
  // 「スピーチしている」時間 = 最初の発話開始から最後の発話終了まで
  const speechDurationSec = Math.max(last.end - first.start, 0.1);

  // 沈黙: スピーチ区間内の単語間ギャップ（0.5秒超）の合計
  let silence = 0;
  let longest = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i]!.start - words[i - 1]!.end;
    if (gap > 0.5) {
      silence += gap;
      if (gap > longest) longest = gap;
    }
  }

  return {
    speechDurationSec,
    silenceRatio: Math.min(Math.max(silence / speechDurationSec, 0), 1),
    longestSilenceSec: longest,
    wordsPerMinute: (words.length / speechDurationSec) * 60,
  };
}

/** アイコンタクト率 = カメラ目線フレーム / 判定可能フレーム */
export function computeEyeContactRatio(
  findings: Array<{ gaze: "camera" | "down" | "away" | "unknown" }>,
): number | null {
  const known = findings.filter((f) => f.gaze !== "unknown");
  if (known.length === 0) return null;
  return known.filter((f) => f.gaze === "camera").length / known.length;
}
