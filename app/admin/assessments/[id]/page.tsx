"use client";

import { use, useCallback, useEffect, useState } from "react";
import { api, gradeColorClass } from "@/components/api";

interface CriterionRow {
  criterionId: string;
  band: "B" | "A" | "S";
  text: string;
  excluded: boolean;
  met: boolean;
  confidence?: number;
  rationale?: string;
  evidence?: Array<{ quote: string; startSec?: number }>;
  source: string;
}

interface EvaluationItemRow {
  itemKey: string;
  category: string;
  grade: string;
  rationale: string;
  criteriaResults: CriterionRow[];
}

interface EvaluationRow {
  id: string;
  source: string;
  isCurrent: boolean;
  matterScore: number;
  mannerScore: number;
  totalScore: number;
  matterGrade: string;
  mannerGrade: string;
  pdLevel: string | null;
  goodPoints: string;
  improvementPoints: string;
  overallComments: string;
  rubricVersion: string;
  llmModel: string | null;
  createdAt: string;
  items: EvaluationItemRow[];
  revisions: Array<{ editor: string; reason: string; createdAt: string }>;
}

interface Detail {
  id: string;
  user: { name: string; email: string };
  role: string;
  motion: string;
  status: string;
  statusDetail: { error?: string } | null;
  transcript: { text: string } | null;
  deliveryMetrics: {
    speechDurationSec: number;
    silenceRatio: number;
    wordsPerMinute: number;
    eyeContactRatio: number | null;
    framesAnalyzed: number;
  } | null;
  generatedSpeeches: Array<{ role: string; script: string }>;
  mediaFiles: Array<{ kind: string; deletedAt: string | null; durationSec: number | null }>;
  evaluations: EvaluationRow[];
}

const ITEM_LABELS: Record<string, string> = {
  reasoning: "主張の理由",
  example: "具体例",
  relevancy: "論題との関連性",
  role_strategy: "役割・戦略性",
  attitude: "態度・話す姿勢",
  eye_contact_gesture: "アイコンタクト・ジェスチャー",
  clarity: "明瞭性",
  time_management: "タイムマネジメント",
};

export default function AdminAssessmentDetail(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const [d, setD] = useState<Detail | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setOverrides({});
    setReason("");
    api<Detail>(`/api/v1/admin/assessments/${id}`).then(setD).catch((e) => setMessage((e as Error).message));
  }, [id]);
  useEffect(load, [load]);

  if (!d) return <p className="text-slate-400">{message || "読み込み中…"}</p>;

  const current = d.evaluations.find((e) => e.isCurrent);
  const overrideCount = Object.keys(overrides).length;

  function toggleCriterion(c: CriterionRow) {
    setOverrides((prev) => {
      const next = { ...prev };
      const newVal = !(c.criterionId in next ? next[c.criterionId] : c.met);
      if (newVal === c.met) delete next[c.criterionId];
      else next[c.criterionId] = newVal;
      return next;
    });
  }

  async function saveRevision() {
    if (!current) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/v1/admin/evaluations/${current.id}/revise`, {
        method: "POST",
        json: {
          criteriaOverrides: Object.entries(overrides).map(([criterionId, met]) => ({ criterionId, met })),
          reason,
        },
      });
      setMessage("修正を保存し、点数を再計算しました");
      load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rejudge() {
    if (!confirm("AI再採点を実行しますか？（現在の評価は履歴として保持されます）")) return;
    setBusy(true);
    try {
      await api(`/api/v1/admin/assessments/${id}/rejudge`, { method: "POST" });
      setMessage("再採点をキューに投入しました");
      load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reissuePdf() {
    if (!current) return;
    setBusy(true);
    try {
      await api(`/api/v1/admin/reports/${current.id}/reissue`, { method: "POST" });
      setMessage("PDFを再発行しました");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <a href="/admin/assessments" className="text-sm text-slate-500 hover:underline">← 一覧へ</a>
      <h1 className="mb-1 mt-2 text-xl font-bold text-[#1b2a5e]">
        {d.user.name} — {d.role} Assessment
      </h1>
      <p className="mb-4 text-sm text-slate-500">
        {d.motion} ／ 状態: {d.status}
        {d.statusDetail?.error && <span className="text-red-600"> ／ エラー: {d.statusDetail.error}</span>}
      </p>

      {message && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm">{message}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={rejudge} disabled={busy} className="rounded-lg border border-[#1b2a5e] px-4 py-2 text-sm font-semibold text-[#1b2a5e] disabled:opacity-50">
          AI再採点
        </button>
        {current && (
          <button onClick={reissuePdf} disabled={busy} className="rounded-lg border border-[#1b2a5e] px-4 py-2 text-sm font-semibold text-[#1b2a5e] disabled:opacity-50">
            PDF再発行
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左: 文字起こし・素材 */}
        <div className="space-y-4">
          <section className="rounded-xl bg-white p-4 shadow">
            <h2 className="mb-2 font-semibold">文字起こし</h2>
            <p className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm leading-relaxed">
              {d.transcript?.text ?? "（未処理）"}
            </p>
          </section>
          {d.deliveryMetrics && (
            <section className="rounded-xl bg-white p-4 shadow text-sm">
              <h2 className="mb-2 font-semibold">計測値</h2>
              <ul className="grid grid-cols-2 gap-1">
                <li>スピーチ時間: {d.deliveryMetrics.speechDurationSec.toFixed(1)}秒</li>
                <li>沈黙率: {(d.deliveryMetrics.silenceRatio * 100).toFixed(0)}%</li>
                <li>話速: {d.deliveryMetrics.wordsPerMinute.toFixed(0)} wpm</li>
                <li>
                  目線率: {d.deliveryMetrics.eyeContactRatio === null ? "—" : `${(d.deliveryMetrics.eyeContactRatio * 100).toFixed(0)}%`}
                  （{d.deliveryMetrics.framesAnalyzed}フレーム）
                </li>
              </ul>
            </section>
          )}
          {d.generatedSpeeches.map((g) => (
            <section key={g.role} className="rounded-xl bg-white p-4 shadow">
              <h2 className="mb-2 font-semibold">AI生成 {g.role} スピーチ（受験者が聞いたもの）</h2>
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{g.script}</p>
            </section>
          ))}
          <section className="rounded-xl bg-white p-4 shadow text-sm">
            <h2 className="mb-2 font-semibold">メディア</h2>
            <ul>
              {d.mediaFiles.map((m, i) => (
                <li key={i}>
                  {m.kind} — {m.deletedAt ? `削除済み (${new Date(m.deletedAt).toLocaleString("ja-JP")})` : "保存中"}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* 右: 評価 */}
        <div className="space-y-4">
          {!current ? (
            <p className="rounded-xl bg-white p-6 text-center text-slate-500 shadow">評価はまだありません</p>
          ) : (
            <>
              <section className="rounded-xl bg-white p-4 shadow">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-semibold">
                    現在の評価（{current.source === "ai" ? "AI" : "管理者修正済み"}）
                  </h2>
                  <span className="text-sm">
                    内容 <b>{current.matterScore}</b> ／ 表現 <b>{current.mannerScore}</b> ／ 合計{" "}
                    <b>{current.totalScore}</b> ／ <b className="text-amber-700">{current.pdLevel ?? "判定外"}</b>
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  ルーブリック {current.rubricVersion} ／ モデル {current.llmModel ?? "—"} ／ 詳細項目のチェックを変更すると保存時に点数が自動再計算されます（点数の直接入力はできません）
                </p>
              </section>

              {(["matter", "manner"] as const).map((cat) => (
                <section key={cat} className="rounded-xl bg-white p-4 shadow">
                  <h3 className="mb-2 font-semibold text-[#1b2a5e]">
                    {cat === "matter" ? "内容（Matter）" : "表現（Manner）"}
                  </h3>
                  {current.items
                    .filter((i) => i.category === cat)
                    .map((item) => (
                      <details key={item.itemKey} className="mb-2 rounded-lg border border-slate-200">
                        <summary className="flex cursor-pointer items-center justify-between p-3">
                          <span className="text-sm font-semibold">{ITEM_LABELS[item.itemKey] ?? item.itemKey}</span>
                          <span className={`text-lg font-extrabold ${gradeColorClass(item.grade)}`}>{item.grade}</span>
                        </summary>
                        <div className="border-t border-slate-100 p-3">
                          {item.rationale && (
                            <p className="mb-2 rounded bg-slate-50 p-2 text-xs text-slate-600">{item.rationale}</p>
                          )}
                          {item.criteriaResults.map((c) => {
                            const effective = c.criterionId in overrides ? overrides[c.criterionId]! : c.met;
                            const changed = c.criterionId in overrides;
                            return (
                              <div
                                key={c.criterionId}
                                className={`mb-2 rounded-lg border p-2 text-xs ${changed ? "border-amber-400 bg-amber-50" : "border-slate-100"} ${c.excluded ? "opacity-50" : ""}`}
                              >
                                <div className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    checked={effective}
                                    disabled={c.excluded}
                                    onChange={() => toggleCriterion(c)}
                                    className="mt-0.5 h-4 w-4"
                                  />
                                  <div className="flex-1">
                                    <p>
                                      <span className="mr-1 rounded bg-slate-200 px-1 font-mono text-[10px]">{c.band}</span>
                                      {c.text}
                                      {c.excluded && <span className="ml-1 text-slate-400">（判定対象外）</span>}
                                      {!c.excluded && c.confidence !== undefined && c.confidence < 0.6 && (
                                        <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">要確認</span>
                                      )}
                                    </p>
                                    {c.rationale && <p className="mt-1 text-slate-500">根拠: {c.rationale}</p>}
                                    {c.evidence?.map((ev, i) => (
                                      <p key={i} className="mt-1 border-l-2 border-slate-300 pl-2 italic text-slate-500">
                                        “{ev.quote}”{ev.startSec !== undefined && ` (${ev.startSec.toFixed(0)}s)`}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ))}
                </section>
              ))}

              <section className="rounded-xl bg-white p-4 shadow">
                <h3 className="mb-2 font-semibold">コメント</h3>
                {[
                  { label: "Good Points", value: current.goodPoints },
                  { label: "Improvement Points", value: current.improvementPoints },
                  { label: "Overall Comments", value: current.overallComments },
                ].map((c) => (
                  <div key={c.label} className="mb-2">
                    <p className="text-xs font-semibold text-slate-500">{c.label}</p>
                    <p className="rounded bg-slate-50 p-2 text-sm">{c.value}</p>
                  </div>
                ))}
              </section>

              {overrideCount > 0 && (
                <section className="sticky bottom-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-lg">
                  <p className="mb-2 text-sm font-semibold">{overrideCount}件の詳細項目を変更しています</p>
                  <input
                    className="mb-2 w-full rounded-lg border border-slate-300 p-2 text-sm"
                    placeholder="修正理由（必須・監査ログに記録されます）"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveRevision}
                      disabled={busy || !reason}
                      className="flex-1 rounded-lg bg-[#1b2a5e] py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      保存して再計算
                    </button>
                    <button
                      onClick={() => setOverrides({})}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                    >
                      取消
                    </button>
                  </div>
                </section>
              )}

              {current.revisions.length > 0 && (
                <section className="rounded-xl bg-white p-4 shadow text-sm">
                  <h3 className="mb-2 font-semibold">修正履歴</h3>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {current.revisions.map((r, i) => (
                      <li key={i}>
                        {new Date(r.createdAt).toLocaleString("ja-JP")} — {r.editor}: {r.reason}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
