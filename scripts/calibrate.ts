try {
  process.loadEnvFile(".env"); // 単体実行時に .env を読み込む（存在しなければ無視）
} catch {}

import { promises as fs } from "node:fs";
import path from "node:path";
import { runCase, formatScoreLine, formatDetails, type JudgeCase } from "./runCase";

/**
 * 採点較正CLI — calibration/*.json のサンプルスピーチを判定し、
 * 期待レンジとの整合と詳細項目ごとの判定根拠を表示する。
 *
 * 使い方:
 *   AI_DRIVER=real ANTHROPIC_API_KEY=... npm run calibrate            # 全ケース
 *   npm run calibrate -- --case=pm-strong                             # 1ケース
 *   npm run calibrate -- --details                                    # 詳細項目の判定も表示
 *
 * 判定プロンプトを修正したら src/ai/prompts.ts の JUDGE_PROMPT_VERSION を上げること。
 */

interface CalibrationCase extends JudgeCase {
  note?: string;
  expected: { matterMin: number; matterMax: number; mannerMin: number; mannerMax: number };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith("--case="))?.slice(7);
  const showDetails = args.includes("--details");

  const dir = path.join(process.cwd(), "calibration");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  let pass = 0;
  let fail = 0;

  console.log(`AI_DRIVER=${process.env.AI_DRIVER ?? "mock"}（mockは配線確認用。較正は必ず real で実行すること）\n`);

  for (const file of files) {
    const c = JSON.parse(await fs.readFile(path.join(dir, file), "utf8")) as CalibrationCase;
    if (only && c.id !== only) continue;

    console.log(`━━━ ${c.id} — ${c.role} / ${c.motion}`);
    if (c.note) console.log(`    ${c.note}`);
    const started = Date.now();
    const result = await runCase(c);
    const { matter, manner } = result.score;
    const matterOk = matter.score >= c.expected.matterMin && matter.score <= c.expected.matterMax;
    const mannerOk = manner.score >= c.expected.mannerMin && manner.score <= c.expected.mannerMax;
    const ok = matterOk && mannerOk;
    ok ? pass++ : fail++;

    console.log(`    結果: ${formatScoreLine(result.score)}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    console.log(
      `    期待: 内容 ${c.expected.matterMin}〜${c.expected.matterMax} ${matterOk ? "✓" : "✗ 逸脱"} ／ 表現 ${c.expected.mannerMin}〜${c.expected.mannerMax} ${mannerOk ? "✓" : "✗ 逸脱"}`,
    );
    const lowConf = result.judgeOutput.judgments.filter((j) => (j.confidence ?? 1) < 0.6);
    if (lowConf.length) {
      console.log(`    要確認（confidence<0.6）: ${lowConf.map((j) => j.criterionId).join(", ")}`);
    }
    if (showDetails || !ok) console.log(formatDetails(result));
    console.log();
  }

  console.log(`結果: ${pass} 件が期待レンジ内 ／ ${fail} 件が逸脱`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
