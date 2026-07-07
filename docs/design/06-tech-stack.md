# 6. 技術スタック

選定基準：①5年以上の保守（メジャーで枯れた技術・採用しやすいスキルセット）②低ランニングコスト
③AIプロバイダ非依存 ④型安全。

## 6.1 一覧

| レイヤ | 採用技術 | 選定理由 |
|--------|----------|----------|
| 言語 | **TypeScript**（フロント・バック共通） | 型安全・人材確保・ドメイン型の共有 |
| フロントエンド | **Next.js 15（App Router）+ React 19** | 実績・長期サポート・SSR/API同居で構成が単純 |
| UIコンポーネント | Tailwind CSS + shadcn/ui | シンプルUIを高速に構築、依存ロックインなし |
| 録画 | ブラウザ **MediaRecorder API**（webm/H.264+Opus） | 追加ライブラリ不要・全主要ブラウザ対応 |
| バックエンド | Next.js API Routes + **独立Workerプロセス**（Node.js 22 LTS） | モジュラーモノリス。重処理はWorkerへ分離 |
| ジョブキュー | **pg-boss**（PostgreSQLベース） | Redis不要でインフラ最小化、再試行・スケジュール対応 |
| DB / ORM | **PostgreSQL 16 + Prisma** | 枯れた組合せ、マイグレーション管理、jsonbで柔軟な判定データ保存 |
| オブジェクトストレージ | S3互換（AWS S3 / Cloudflare R2） | 署名付きURL・ライフサイクル削除 |
| 音声・映像処理 | **ffmpeg**（音声抽出・音量統計・フレーム抽出）| 標準ツール、コンテナに同梱 |
| 文字起こし (STT) | OpenAI `gpt-4o-transcribe`（代替: `whisper-1` / Deepgram / Google STT） | 単語タイムスタンプ・多言語（日本語対応=第2フェーズ要件）。**SttPortで差替可能** |
| 音声合成 (TTS) | OpenAI TTS（代替: Google Cloud TTS） | LO用PMスピーチの自然な読み上げ。**TtsPortで差替可能** |
| AI判定・生成 | **Anthropic Claude（claude-sonnet-5、設定で変更可）** | 構造化出力（tool use + JSON Schema）・長文ルーブリックの忠実な適用・Visionでフレーム判定も同一プロバイダで完結 |
| PDF生成 | HTMLテンプレート + **Playwright**（headless Chromium） | 証明書サンプル同等のデザイン再現性・日本語フォント対応 |
| 認証 | Auth.js（NextAuth v5）Credentials + セッションCookie | 最小構成。将来SSOに拡張可 |
| バリデーション | Zod（API入出力・LLM出力・設定値） | 実行時型検証 |
| i18n | next-intl | UI多言語化（第2フェーズ） |
| テスト | Vitest（単体: RubricEngine 全帯域網羅）+ Playwright（E2E）+ ゴールデンセット回帰 | |
| CI/CD | GitHub Actions（lint / typecheck / test / migrate / deploy） | |
| 監視 | 構造化ログ（pino）+ Sentry（エラー）+ ジョブ失敗の管理画面通知 | |
| デプロイ | **Docker**（web + worker の2サービス）。推奨: AWS（ECS Fargate + RDS + S3）または Render/Fly.io | ffmpeg・長時間ジョブが必要なためサーバレスFaaSは不採用 |

## 6.2 コスト概算（変動費・1受験あたり）

| 項目 | 概算 |
|------|------|
| STT 3.5分 | 約 $0.02 |
| LLM判定（構造抽出+8項目判定+コメント、入力〜30k tok） | 約 $0.10〜0.20 |
| Visionフレーム判定（〜100フレーム・低解像度バッチ） | 約 $0.05〜0.10 |
| TTS（LO時、3分） | 約 $0.05 |
| **合計** | **1受験 約 $0.2〜0.4（30〜60円）** |

固定費：小規模構成で月 $30〜80 程度（DB・コンテナ・ストレージ）。録画即削除運用によりストレージ費はほぼゼロ。

## 6.3 リポジトリ構成（実装時）

```
/
├─ app/                    # Next.js（画面 + API Routes）
├─ src/
│   ├─ domain/             # エンティティ・RubricEngine・RoleSpec（外部依存ゼロ・最重要テスト対象）
│   ├─ ports/              # SttPort, TtsPort, JudgeLlmPort, VisionPort, StoragePort, PdfPort, MediaSourcePort
│   ├─ adapters/           # openai-stt, openai-tts, claude-judge, claude-vision, s3, playwright-pdf, ffmpeg
│   ├─ pipeline/           # 採点パイプラインのジョブ定義（pg-boss）
│   └─ services/           # ユースケース（受験進行・評価修正・再発行）
├─ prisma/                 # スキーマ・マイグレーション・シード（ルーブリック定義・RoleSpec・暫定PD Level表）
├─ worker/                 # Workerエントリポイント
├─ tests/                  # unit / e2e / golden（採点回帰）
├─ docs/design/            # 本設計書
└─ legacy/                 # 旧Zoom POIジャッジ試作（参照用）
```
