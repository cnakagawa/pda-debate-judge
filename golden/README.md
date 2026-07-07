# ゴールデンテストセット（人間ジャッジ済みサンプル）

PDA の人間ジャッジが採点したスピーチを登録すると、`npm run golden` でAI採点との
一致率（項目グレード一致・カテゴリ点±1以内・PDレベル一致）を回帰計測できます。

**プロンプト・モデル・ルーブリック定義を変更したら必ず実行**し、一致率が下がって
いないことを確認してからリリースしてください（CIでは `GOLDEN_MIN_ITEM_AGREEMENT` /
`GOLDEN_MIN_SCORE_NEAR` を設定するとしきい値未達で失敗します）。

## 登録方法

このディレクトリに `case-XXX.json` を追加します（`_` 始まりのファイルは無視されます）。
`_template.json` をコピーして作成してください。

| フィールド | 内容 |
|---|---|
| `id` | 一意なID |
| `role` | `PM` / `LO`（第2フェーズ以降 `MG` 等も可） |
| `motion` | 論題 |
| `transcript` | スピーチの文字起こし全文 |
| `pmSpeech` | LOの場合のみ: 受験者が聞いたPMスピーチ全文 |
| `metrics` | 計測値（実測がなければ省略可。スピーチ時間・沈黙率・目線率） |
| `human.matterScore` / `mannerScore` | 人間ジャッジの点数（0〜10） |
| `human.itemGrades` | 8項目の S/A/B/C |
| `human.judge` / `judgedAt` | ジャッジ名（任意）・採点日 |

## 実行

```bash
AI_DRIVER=real ANTHROPIC_API_KEY=sk-... npm run golden
```

※ 動画は不要です。文字起こしと計測値から本番と同一の判定・採点を実行します
（アイコンタクト等の映像依存項目は `metrics.eyeContactRatio` の値を使用）。
