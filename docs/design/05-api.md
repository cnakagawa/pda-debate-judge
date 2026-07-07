# 5. API 設計

REST（`/api/v1`）+ SSE（進捗配信）。認証はセッションCookie（HttpOnly）。
すべてのレスポンスは `{ data }` / `{ error: { code, message } }` 形式。Zod による入出力スキーマ検証。

## 5.1 認証

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/auth/register` | 氏名・メール・パスワードで登録 |
| POST | `/auth/login` / `/auth/logout` | |
| GET | `/auth/me` | ログイン中ユーザー情報 |

## 5.2 受験フロー（受験者）

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/assessments` | `{ role: "PM"\|"LO" }` → 論題をランダム抽選しセッション作成。`{ id, motion, role, flow }` を返す |
| POST | `/assessments/:id/prep/start` | 準備開始（5:00タイマーはサーバ時刻基準。状態→`preparing`） |
| POST | `/assessments/:id/pm-speech` | **LOのみ**。生成済みPMスピーチの `{ audioUrl, durationSec }` を返す（準備開始時にバックグラウンド生成開始し、ここでは完成を待つ。スクリプト本文は返さない） |
| POST | `/assessments/:id/recording/start` | 状態→`recording`（開始時刻記録） |
| POST | `/assessments/:id/upload-url` | 録画アップロード用の署名付きURL発行（`{ url, mediaFileId }`） |
| POST | `/assessments/:id/submit` | アップロード完了通知 → 状態`processing`、採点パイプライン投入 |
| GET | `/assessments/:id` | 状態・進捗（`status`, `status_detail`） |
| GET | `/assessments/:id/events` | **SSE**：パイプライン進捗をリアルタイム配信（`transcribing`→`judging`→`reporting`→`done`/`failed`） |
| GET | `/assessments/:id/report` | レポート表示用JSON（下記 5.4） |
| GET | `/assessments/:id/report.pdf` | PDF（最新 evaluation に対応する発行済PDF） |
| POST | `/assessments/:id/abandon` | 中断 |
| GET | `/assessments?mine=1&page=` | 自分の受験履歴 |

状態遷移はサーバ側で厳密に検証（例: `preparing` 以外からの `recording/start` は 409）。
準備時間・録画時間の超過はサーバ時刻で判定し、クライアント改変の影響を受けない。

## 5.3 管理者 API（`role=admin` 必須・全操作 audit_logs 記録）

| メソッド | パス | 説明 |
|---|---|---|
| GET/POST | `/admin/motions` | 論題一覧（検索）/ 追加 |
| PATCH/DELETE | `/admin/motions/:id` | 編集・有効/無効切替 / 削除（受験実績があれば無効化のみ） |
| GET | `/admin/assessments` | 全受験履歴（期間・役割・状態・受験者でフィルタ） |
| GET | `/admin/assessments/:id` | 詳細（文字起こし・計測値・生成PMスピーチ・評価・修正履歴） |
| GET | `/admin/evaluations/:id` | 評価詳細（8項目×詳細項目の判定＋根拠） |
| POST | `/admin/evaluations/:id/revise` | 修正：`{ criteriaOverrides: [{criterionId, met}], comments?, reason }` → RubricEngine 再計算 → 新 evaluation 世代を作成して返す |
| POST | `/admin/assessments/:id/rejudge` | AI再採点（プロンプト/モデル更新後の再実行。旧評価は世代として保持） |
| POST | `/admin/reports/:id/reissue` | 指定 evaluation でPDF再発行 |
| GET/PUT | `/admin/settings` | 録画保存ON/OFF・PD Level換算表・判定閾値・採点モデル・受験回数上限 |
| GET | `/admin/jobs/failed` / POST `/admin/jobs/:id/retry` | 失敗ジョブの確認・再実行 |

## 5.4 レポートJSON（`GET /assessments/:id/report`）

```jsonc
{
  "reportTitle": "PD Assessment Report",
  "name": "山田 花子",
  "testDate": "2026-07-07",
  "motion": "THW ban ...",
  "role": "PM",
  "language": "en",
  "matter": { "score": 6, "grade": "A" },
  "manner": { "score": 5, "grade": "B" },
  "totalScore": 11,
  "pdLevel": "PD4",              // 内容×表現マトリクスで判定（判定外の場合は null）
  "cefrReference": "A2〜B1",     // 参考表示（設定でON/OFF）
  "items": [
    { "key": "reasoning",  "label": "主張の理由", "category": "matter", "grade": "A" },
    { "key": "example",    "label": "具体例",     "category": "matter", "grade": "A" },
    // ... 8項目
  ],
  "goodPoints": "…（150〜200字）",
  "improvementPoints": "…（150〜200字）",
  "overallComments": "…（150〜200字）",
  "notes": ["本レポートはAIによる学習用アセスメントであり、公式PD検定の結果ではありません。",
             "Web受験版のため POI は評価対象外です。"],
  "evaluationSource": "ai",          // 管理者修正後は "admin_edit"
  "rubricVersion": "2020-07-10.v1"
}
```

## 5.5 エラー・制限

- `429`：1日あたり受験回数上限（設定値）超過。
- アップロード上限：500MB / webm・mp4 のみ受付。ウイルススキャンは対象外（自己録画のみのため）だが MIME 検証は実施。
- パイプライン失敗時：`status=failed` + `status_detail.error`。受験者には平易なメッセージ、管理者には詳細を表示。
- 冪等性：`submit` は同一 mediaFileId に対して1回のみ有効（二重投稿防止）。
