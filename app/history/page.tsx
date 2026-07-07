"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";

interface HistoryItem {
  id: string;
  role: string;
  motion: string;
  status: string;
  testDate: string;
  totalScore: number | null;
  matterScore: number | null;
  mannerScore: number | null;
  pdLevel: string | null;
}

/** 成長グラフ（内容・表現スコアの推移 + PDレベル。成長方向は PD6→PD1） */
function GrowthChart({ items }: { items: HistoryItem[] }) {
  const scored = items
    .filter((a) => a.status === "scored" && a.matterScore !== null)
    .slice()
    .reverse(); // 古い順
  if (scored.length < 2) return null;

  const W = 640;
  const H = 200;
  const PAD = { l: 30, r: 16, t: 24, b: 34 };
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(scored.length - 1, 1);
  const y = (score: number) => H - PAD.b - (score / 10) * (H - PAD.t - PAD.b);
  const line = (get: (a: HistoryItem) => number) =>
    scored.map((a, i) => `${x(i)},${y(get(a))}`).join(" ");

  return (
    <section className="mb-6 rounded-2xl bg-white p-6 shadow">
      <h2 className="mb-1 font-bold text-[#1b2a5e]">成長の記録</h2>
      <p className="mb-2 text-xs text-slate-500">
        内容・表現スコア（0〜10）とPDレベルの推移です。PD1が最上位レベルです。
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{v}</text>
          </g>
        ))}
        <polyline points={line((a) => a.matterScore!)} fill="none" stroke="#2563eb" strokeWidth="2.5" />
        <polyline points={line((a) => a.mannerScore!)} fill="none" stroke="#16a34a" strokeWidth="2.5" />
        {scored.map((a, i) => (
          <g key={a.id}>
            <circle cx={x(i)} cy={y(a.matterScore!)} r="4" fill="#2563eb" />
            <circle cx={x(i)} cy={y(a.mannerScore!)} r="4" fill="#16a34a" />
            <text x={x(i)} y={PAD.t - 8} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#b45309">
              {a.pdLevel ?? "—"}
            </text>
            <text x={x(i)} y={H - PAD.b + 14} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {a.testDate.slice(5)}
            </text>
            <text x={x(i)} y={H - PAD.b + 26} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {a.role}
            </text>
          </g>
        ))}
        <g fontSize="10">
          <circle cx={PAD.l + 8} cy={12} r="4" fill="#2563eb" />
          <text x={PAD.l + 16} y={16} fill="#475569">内容 (Matter)</text>
          <circle cx={PAD.l + 98} cy={12} r="4" fill="#16a34a" />
          <text x={PAD.l + 106} y={16} fill="#475569">表現 (Manner)</text>
        </g>
      </svg>
    </section>
  );
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<HistoryItem[]>("/api/v1/assessments")
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1b2a5e]">Assessment History</h1>
        <a href="/" className="text-sm text-slate-500 hover:underline">← ホーム</a>
      </header>
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {items === null ? (
        <p className="text-center text-slate-400">読み込み中…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow">
          まだ受験履歴がありません。ホームから最初のアセスメントに挑戦しましょう。
        </p>
      ) : (
        <>
        <GrowthChart items={items} />
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id}>
              <a
                href={a.status === "scored" ? `/report/${a.id}` : "#"}
                className={`block rounded-xl bg-white p-4 shadow ${a.status === "scored" ? "hover:bg-slate-50" : "opacity-60"}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="mr-2 rounded bg-[#1b2a5e] px-2 py-0.5 text-xs font-bold text-white">
                      {a.role}
                    </span>
                    <span className="text-sm text-slate-500">{a.testDate}</span>
                    <p className="mt-1 text-sm font-semibold">{a.motion}</p>
                  </div>
                  <div className="text-right">
                    {a.status === "scored" ? (
                      <>
                        <p className="text-lg font-bold text-[#1b2a5e]">{a.totalScore}/20</p>
                        <p className="text-sm font-semibold text-amber-700">{a.pdLevel ?? "—"}</p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">
                        {a.status === "processing" ? "採点中" : "失敗"}
                      </p>
                    )}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
        </>
      )}
    </main>
  );
}
