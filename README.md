# PD Assessment System（PD検定アセスメント版）

一般社団法人パーラメンタリーディベート人財育成協会（PDA）の公式AIアセスメントシステムです。
受験者がWebブラウザでディベートスピーチ（PM / LO）を録画し、**PDA公式ルーブリックに厳密準拠したAI採点**を受けて
**PD Assessment Report**（画面 + PDF）を取得できます。

> 本システムは学習用アセスメントであり、公式PD検定の合否・級を証明するものではありません。

## 主な機能

- **PM Assessment** — 論題表示 → 準備5分 → スピーチ3分録画 → AI採点 → レポート
- **LO Assessment** — 準備5分 → AI生成のPMスピーチを音声再生 → 反論スピーチ3分録画 → AI採点 → レポート
- **ルーブリック厳密採点** — AIは詳細項目の充足判定（true/false + 根拠引用）のみを行い、
  点数計算はExcelルーブリックの規則を実装した決定的コード（RubricEngine）が行う
- **PD Level 換算** — PDA提供の内容×表現マトリクス（PD1〜PD6）+ CEFR参考表示
- **録画の自動削除** — 録画→文字起こし→採点→削除（管理者設定で保存ONに切替可能）
- **管理者画面** — 論題管理 / Assessment履歴 / AI評価確認 / 評価修正（詳細項目単位・自動再計算・修正履歴）/
  録画保存設定 / PDF再発行 / AI再採点

## セットアップ

### 必要なもの

- Node.js 20+ / PostgreSQL 16 / ffmpeg / Chromium（PDF生成用）
- （本番）Anthropic APIキー・OpenAI APIキー

### 手順

```bash
npm install
cp .env.example .env        # DATABASE_URL, SESSION_SECRET 等を設定
npx prisma migrate deploy   # スキーマ適用
npm run db:seed             # ルーブリック・役割定義・初期論題・管理者アカウント投入
npm run dev                 # Web (http://localhost:3000)
npm run worker              # 採点ワーカー（別プロセス・必須）
```

Docker の場合:

```bash
docker compose up --build   # db + web + worker
```

### AIドライバ

| `AI_DRIVER` | 動作 |
|---|---|
| `mock`（既定） | APIキー不要。決定的なモック判定で全フローを動作確認できる（**開発・デモ専用**） |
| `real` | STT=OpenAI Whisper、判定・生成・映像解析=Anthropic Claude。`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` が必要 |

初期管理者は `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`（既定: `admin@example.com` / `change-me-admin`）。
**本番投入前に必ず変更してください。**

## テスト

```bash
npm test          # RubricEngine・PD Levelマトリクス・計測判定の単体テスト（全帯域網羅）
npm run typecheck
```

## アーキテクチャ

設計書一式は [docs/design/](docs/design/README.md) を参照してください
（アーキテクチャ / DB設計 / 画面遷移 / 採点ロジック / API / 技術スタック / ロードマップ / MVPスコープ）。

```
app/                # Next.js 15 App Router（受験UI・管理UI・API Routes）
src/
  domain/           # ルーブリック定義・RubricEngine・PD Levelマトリクス・役割定義（外部依存ゼロ）
  ports/            # STT / TTS / Judge / Vision / Storage / PDF のインターフェース
  adapters/         # Claude / OpenAI / Mock / S3・ローカル / ffmpeg / Playwright PDF
  pipeline/         # 採点パイプライン（pg-boss ジョブ）
  services/         # 評価保存・レポート発行・受験進行・PMスピーチ生成
worker/             # 採点ワーカーのエントリポイント
prisma/             # スキーマ・マイグレーション・シード
tests/              # 単体テスト（ゴールデン回帰の起点）
docs/design/        # 設計書
legacy/             # 旧Zoom POIジャッジ試作（第2フェーズで参照）
```

### 採点の流れ

```
録画アップロード
→ ffmpegで音声抽出・フレーム抽出（0.5fps）
→ 文字起こし（単語タイムスタンプ）
→ 計測（スピーチ時間・沈黙率・話速・音量）      ← タイムマネジメント等は決定的判定
→ 映像解析（カメラ目線率・姿勢・ジェスチャー）   ← 削除前に必ず実施
→ LLM判定（ルーブリック詳細項目ごとの充足 + 根拠引用）
→ RubricEngine が点数・S/A/B/C・PD Level を計算
→ コメント生成（Good/Improvement/Overall 各150〜200字）
→ PD Assessment Report (PDF) 発行
→ 録画・音声を削除（設定が「保存ON」の場合は保持）
```

## 将来拡張（設計済み）

- Zoom / Teams / Meet 連携（`MediaSourcePort` に入口を追加）
- MG / MO / LOR / PMR（役割定義・Reply用ルーブリック差分は実装済み。有効化のみ）
- 日本語ディベート（`language` 属性が全域を伝播済み）

## ライセンス

MIT（PDA向けに開発）
