# 🎙️ Debate Judge Bot — POI-aware auto adjudicator

Zoomで実施する **英語即興型ディベート** の自動ジャッジシステムです。
Zoomの文字起こしから、発話者ごとのスピーチ・**POI（Point of Information）**・POIへの応答を
自動で整理し、ジャッジコメントと評価点を出します。

このバージョンの最大の改善点は、**POIを「単なる発話」ではなく構造化された「イベント（POIEvent）」として扱う**ことです。
Zoomの文字起こしは「誰が質問したか／誰が答えたか」が曖昧なため、
**AIが下書き → 人間が確認・修正 → 再評価** という流れを前提に設計しています。

---

## ✨ 主な機能

| # | 機能 | 説明 |
|---|------|------|
| 1 | **入力** | Zoom transcript を貼り付け・アップロード（`.txt` / `.vtt` / `.srt`）・直接入力 |
| 2 | **発話分類** | Constructive speech / Reply speech / POI request / POI question / POI response / Chair・Moderator / Noise |
| 3 | **POIをイベント化** | 求めた人・受けた人・質問・回答・status(accepted/declined/ignored/unclear)・質を記録 |
| 4 | **発話者推定** | 発話者が不明でもAIが推定し **confidence score** を表示 |
| 5 | **要確認フラグ** | 信頼度が低い項目は「要確認」と表示し、手動修正できる |
| 6 | **集計** | チーム・スピーカーごとにPOI評価を集計 |
| 7 | **最終出力** | 勝敗 / 各スピーカー評価 / 各チーム評価 / POI評価 / 改善コメント / 教育的フィードバック |

### POIEvent の構造

```jsonc
{
  "requester": "Opposition 1",       // POIを求めた人（不明なら null）
  "target_speaker": "Government 1",  // POIを受けた人
  "question_text": "Isn't it true that a ban would hit low-income families hardest?",
  "response_text": "No, because our subsidy scheme caps the price...",
  "status": "accepted",              // accepted | declined | ignored | unclear
  "requester_team": "Opposition",
  "target_team": "Government",
  "confidence": 0.8,                 // 自動検出の信頼度
  "needs_manual_review": false,      // 要確認フラグ
  "evaluation": {
    "relevance": 4.2,                // 論点に関係しているか
    "challenge_strength": 3.8,       // 相手の弱点を突いているか
    "strategic_value": 4.0,          // 勝敗に関わる重要な点か
    "clarity": 4.5,                  // 短く明確か
    "response_quality": 3.5,         // 回答が質問に直接答えているか（未回答なら null）
    "comment": "On-topic and engages the speech directly. ..."
  }
}
```

---

## 🧭 使い方（4ステップ）

画面上部のステップに沿って操作します。初心者でも迷いません。

1. **Transcriptを貼る** — テキストを貼り付け or ファイルをアップロード。
   チーム名・1チームの人数を設定して「解析する」。
2. **発話者を確認する** — AIが推定した発話者とチームを確認。
   `要確認` のものは信頼度が低いので Role / Team を修正して保存。
3. **POIを確認・修正する** — POI一覧を表で確認。
   requester / target / question / response / status を直接編集。
   POIを手動追加・削除も可能。「Save edits」で保存。
4. **ジャッジ結果を出す** — 「Re-evaluate & Judge」で再評価。
   勝敗・各評価・POI評価・改善コメント・教育的フィードバックを表示。JSONエクスポートも可能。

> 💡 **設計思想**：Zoom transcriptだけでは発話者識別が完全ではありません。
> このツールは *完璧な自動化* ではなく、**AIの下書きを人間が確認・修正して再評価する**流れを重視しています。

---

## 🚀 セットアップ

### Replit で動かす

1. このリポジトリを Replit に import。
2. **Run** を押すだけ（`npm install && npm start` が自動実行されます）。
3. Webview で開いた画面で操作します。

### ローカルで動かす

```bash
npm install
npm start          # http://localhost:3000
npm test           # POI検出ロジックのテスト
```

### AI強化モード（任意）

APIキーが無くても **ルールベースで完全に動作** します（オフラインでもOK）。
より高精度な発話者推定・POI抽出・ジャッジコメントが欲しい場合は、
Claude API キーを設定してください。

- Replit の **Secrets** に以下を追加：
  - `ANTHROPIC_API_KEY` … あなたのAnthropic APIキー
  - `CLAUDE_MODEL`（任意）… 既定は `claude-sonnet-5`
- 設定されると画面右上のバッジが **AI: on** になり、
  解析・ジャッジ時にAIが下書きを高精度化します（失敗時は自動でルールベースに戻ります）。

---

## 🧪 サンプル transcript

`samples/` に3種類の動作確認用データを同梱しています（画面から「Load a sample…」で読み込み可）。

| ファイル | 種類 |
|----------|------|
| `1_named_speakers.txt` | 発話者名つき（Government 1 など）— きれいなケース |
| `2_partial_participant.txt` | 発話者名が全て `Participant`（不完全）— 要確認多数 |
| `3_noisy_zoom_vtt.txt` | ノイズ入り WebVTT（タイムスタンプ・背景音・chair発言） |

---

## 🏗️ 構成

```
server.js            Express サーバ（API + 静的UI配信）
src/
  parser.js          transcript → utterances / speakers / POIEvents（コア）
  evaluate.js        POI評価 + 最終ジャッジ（ルールベース）
  llm.js             Claude連携（任意・失敗時はフォールバック）
  store.js           セッション & POIEvent の保存・編集（ファイル永続化）
public/              フロントエンド（4ステップ ウィザードUI）
samples/             サンプル transcript
test/parser.test.js  POI検出のテスト（node --test）
```

### API 概要

| メソッド | パス | 用途 |
|----------|------|------|
| `POST` | `/api/parse` | transcriptを解析してセッション作成 |
| `GET`  | `/api/session/:id` | セッション取得 |
| `PUT`  | `/api/session/:id/speakers` | 発話者の修正を保存 |
| `PUT`  | `/api/session/:id/pois` | POIEvent一覧の修正を保存 |
| `PATCH`| `/api/session/:id/pois/:poiId` | POIを1件更新 |
| `POST` | `/api/session/:id/judge` | 再評価してジャッジ結果を返す |

---

## 📐 POIの評価観点

各POIを以下の観点で 0〜5 点評価します。

- **relevance** — 論点に関係しているか
- **challenge_strength** — 相手の議論の弱点を突いているか
- **strategic_value** — 試合の勝敗に関わる重要な点か
- **clarity** — 短く明確か
- **response_quality** — 回答者が質問に直接答え、自分の議論を守れているか（未回答なら該当なし）

チーム／スピーカーごとに、POIを **出した数・受けた数・答えた数・平均質** を集計し、
最終スコアに反映します（スピーチ評価を主、POIを勝敗を分けるマージンとして扱います）。

---

## ⚠️ 注意

- Zoomの文字起こしは発話者識別が不完全です。**必ずステップ2・3で人間が確認・修正**してください。
- 単一ラベル（全員 `Participant`）の場合、AIは位置から下書きしますが信頼度は低く、
  すべて「要確認」になります。修正後に再評価すると結果が変わります。
- ルールベースの点数は透明性重視の概算です。AIモードを有効にすると、より内容に踏み込んだ評価になります。
