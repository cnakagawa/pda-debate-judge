try {
  process.loadEnvFile(".env"); // 単体実行時に .env を読み込む（存在しなければ無視）
} catch {}

import { promises as fs } from "node:fs";
import path from "node:path";
import { runCase, formatScoreLine, type JudgeCase } from "./runCase";
import type { Grade, ItemKey } from "../src/domain/types";

/**
 * ゴールデン回帰テスト — 人間ジャッジ済みサンプル（golden/*.json）に対して
 * AI採点を実行し、一致率を計測する。
 *
 * プロンプト・モデル・ルーブリック定義を変更した際は必ず実行し、
 * 一致率が下がっていないことを確認してからリリースすること。
 *
 * 使い方:
 *   AI_DRIVER=real ANTHROPIC_API_KEY=... npm run golden
 *
 * しきい値（環境変数・未設定なら計測のみで失敗にしない）:
 *   GOLDEN_MIN_ITEM_AGREEMENT=0.75   項目グレード一致率の下限
 *   GOLDEN_MIN_SCORE_NEAR=0.8        カテゴリ点±1以内率の下限
 */

interface GoldenCase extends JudgeCase {
  human: {
    matterScore: number;
    mannerScore: number;
    itemGrades: Record<ItemKey, Grade>;
    judge?: string;
    judgedAt?: string;
  };
}

async function main() {
  const dir = path.join(process.cwd(), "golden");
  const files = (await fs.readdir(dir).catch(() => [] as string[]))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort();

  if (files.length === 0) {
    console.log("golden/ に人間ジャッジ済みサンプルがありません。golden/README.md の形式で追加してください。");
    return;
  }

  let itemTotal = 0;
  let itemMatch = 0;
  let scoreExact = 0;
  let scoreNear = 0;
  let scoreTotal = 0;
  let levelMatch = 0;

  for (const file of files) {
    const c = JSON.parse(await fs.readFile(path.join(dir, file), "utf8")) as GoldenCase;
    const result = await runCase(c);
    const items = [...result.score.matter.items, ...result.score.manner.items];

    const diffs: string[] = [];
    for (const item of items) {
      const expected = c.human.itemGrades[item.key];
      if (!expected) continue;
      itemTotal++;
      if (item.grade === expected) itemMatch++;
      else diffs.push(`${item.key}: AI=${item.grade} 人間=${expected}`);
    }

    for (const [aiScore, humanScore] of [
      [result.score.matter.score, c.human.matterScore],
      [result.score.manner.score, c.human.mannerScore],
    ] as const) {
      scoreTotal++;
      if (aiScore === humanScore) scoreExact++;
      if (Math.abs(aiScore - humanScore) <= 1) scoreNear++;
    }

    const humanTotalLevelBase = { matter: c.human.matterScore, manner: c.human.mannerScore };
    const { pdLevelFor } = await import("../src/domain/pdLevel");
    const humanLevel = pdLevelFor(humanTotalLevelBase.matter, humanTotalLevelBase.manner);
    if (humanLevel === result.score.pdLevel) levelMatch++;

    console.log(`━━━ ${c.id}`);
    console.log(`    AI:   ${formatScoreLine(result.score)}`);
    console.log(`    人間: 内容 ${c.human.matterScore} ／ 表現 ${c.human.mannerScore} ／ ${humanLevel ?? "判定外"}${c.human.judge ? `（${c.human.judge}）` : ""}`);
    if (diffs.length) console.log(`    項目差分: ${diffs.join(" / ")}`);
    console.log();
  }

  const itemRate = itemTotal ? itemMatch / itemTotal : 0;
  const nearRate = scoreTotal ? scoreNear / scoreTotal : 0;
  console.log("═══ 集計 ═══");
  console.log(`項目グレード一致率: ${(itemRate * 100).toFixed(1)}% (${itemMatch}/${itemTotal})`);
  console.log(`カテゴリ点 完全一致: ${((scoreExact / scoreTotal) * 100).toFixed(1)}% ／ ±1以内: ${(nearRate * 100).toFixed(1)}%`);
  console.log(`PDレベル一致: ${levelMatch}/${files.length}`);

  const minItem = process.env.GOLDEN_MIN_ITEM_AGREEMENT ? parseFloat(process.env.GOLDEN_MIN_ITEM_AGREEMENT) : null;
  const minNear = process.env.GOLDEN_MIN_SCORE_NEAR ? parseFloat(process.env.GOLDEN_MIN_SCORE_NEAR) : null;
  if ((minItem !== null && itemRate < minItem) || (minNear !== null && nearRate < minNear)) {
    console.error("しきい値を下回りました。プロンプト・モデルの変更を見直してください。");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
