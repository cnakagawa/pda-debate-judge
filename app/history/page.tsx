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
  pdLevel: string | null;
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
      )}
    </main>
  );
}
