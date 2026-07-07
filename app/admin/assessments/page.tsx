"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";

interface Row {
  id: string;
  userName: string;
  userEmail: string;
  role: string;
  motion: string;
  status: string;
  createdAt: string;
  totalScore: number | null;
  pdLevel: string | null;
  evaluationSource: string | null;
}

export default function AdminAssessmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (role) params.set("role", role);
    if (q) params.set("q", q);
    params.set("page", String(page));
    api<{ total: number; items: Row[] }>(`/api/v1/admin/assessments?${params}`)
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch(console.error);
  }, [status, role, q, page]);
  useEffect(load, [load]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-[#1b2a5e]">Assessment履歴（{total}件）</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-slate-300 p-2 text-sm">
          <option value="">全状態</option>
          {["scored", "processing", "failed", "abandoned"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="rounded-lg border border-slate-300 p-2 text-sm">
          <option value="">全Role</option>
          <option value="PM">PM</option>
          <option value="LO">LO</option>
        </select>
        <input
          className="rounded-lg border border-slate-300 p-2 text-sm"
          placeholder="氏名・メールで検索"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">受験者</th>
              <th className="p-3">Role</th>
              <th className="p-3">論題</th>
              <th className="p-3">状態</th>
              <th className="p-3">スコア</th>
              <th className="p-3">PD Level</th>
              <th className="p-3">評価</th>
              <th className="p-3">日時</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3">
                  <a href={`/admin/assessments/${a.id}`} className="text-[#1b2a5e] underline">{a.userName}</a>
                  <span className="block text-xs text-slate-400">{a.userEmail}</span>
                </td>
                <td className="p-3">{a.role}</td>
                <td className="max-w-64 truncate p-3">{a.motion}</td>
                <td className="p-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    a.status === "scored" ? "bg-green-100 text-green-700"
                    : a.status === "failed" ? "bg-red-100 text-red-700"
                    : "bg-slate-100 text-slate-500"}`}>
                    {a.status}
                  </span>
                </td>
                <td className="p-3">{a.totalScore ?? "—"}</td>
                <td className="p-3">{a.pdLevel ?? "—"}</td>
                <td className="p-3 text-xs">{a.evaluationSource === "admin_edit" ? "修正済" : a.evaluationSource === "ai" ? "AI" : "—"}</td>
                <td className="p-3 text-xs text-slate-500">{new Date(a.createdAt).toLocaleString("ja-JP")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-40">前へ</button>
        <span className="py-1 text-sm">{page}</span>
        <button disabled={page * 30 >= total} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-40">次へ</button>
      </div>
    </div>
  );
}
