"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";

interface Dashboard {
  totalScored: number;
  scoredLast30Days: number;
  failedCount: number;
  processingCount: number;
  examineeCount: number;
  recent: Array<{
    id: string;
    userName: string;
    role: string;
    status: string;
    createdAt: string;
    totalScore: number | null;
    pdLevel: string | null;
  }>;
}

export default function AdminDashboard() {
  const [d, setD] = useState<Dashboard | null>(null);

  useEffect(() => {
    api<Dashboard>("/api/v1/admin/dashboard").then(setD).catch(console.error);
  }, []);

  if (!d) return <p className="text-slate-400">読み込み中…</p>;

  const stats = [
    { label: "累計採点数", value: d.totalScored },
    { label: "直近30日", value: d.scoredLast30Days },
    { label: "受験者数", value: d.examineeCount },
    { label: "採点中", value: d.processingCount },
    { label: "失敗", value: d.failedCount, alert: d.failedCount > 0 },
  ];

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-[#1b2a5e]">ダッシュボード</h1>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-xl bg-white p-4 text-center shadow ${s.alert ? "ring-2 ring-red-400" : ""}`}
          >
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.alert ? "text-red-600" : "text-[#1b2a5e]"}`}>{s.value}</p>
          </div>
        ))}
      </div>
      <h2 className="mb-2 font-semibold">最近の受験</h2>
      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">受験者</th>
              <th className="p-3">Role</th>
              <th className="p-3">状態</th>
              <th className="p-3">スコア</th>
              <th className="p-3">PD Level</th>
              <th className="p-3">日時</th>
            </tr>
          </thead>
          <tbody>
            {d.recent.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3">
                  <a href={`/admin/assessments/${a.id}`} className="text-[#1b2a5e] underline">
                    {a.userName}
                  </a>
                </td>
                <td className="p-3">{a.role}</td>
                <td className="p-3">{a.status}</td>
                <td className="p-3">{a.totalScore ?? "—"}</td>
                <td className="p-3">{a.pdLevel ?? "—"}</td>
                <td className="p-3 text-xs text-slate-500">{new Date(a.createdAt).toLocaleString("ja-JP")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
