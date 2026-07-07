"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";

interface Motion {
  id: string;
  textEn: string;
  textJa: string | null;
  category: string | null;
  difficulty: number | null;
  targetRoles: string[];
  isActive: boolean;
  assessmentCount: number;
}

export default function MotionsPage() {
  const [motions, setMotions] = useState<Motion[]>([]);
  const [textEn, setTextEn] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    api<Motion[]>("/api/v1/admin/motions").then(setMotions).catch(console.error);
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      await api("/api/v1/admin/motions", {
        method: "POST",
        json: { textEn, category: category || undefined, targetRoles: ["PM", "LO"] },
      });
      setTextEn("");
      setCategory("");
      load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function toggle(m: Motion) {
    await api(`/api/v1/admin/motions/${m.id}`, {
      method: "PATCH",
      json: { isActive: !m.isActive },
    });
    load();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-[#1b2a5e]">論題管理</h1>
      <form onSubmit={add} className="mb-6 flex flex-wrap gap-2 rounded-xl bg-white p-4 shadow">
        <input
          className="min-w-64 flex-1 rounded-lg border border-slate-300 p-2 text-sm"
          placeholder="論題（英語）例: We should ban ..."
          value={textEn}
          onChange={(e) => setTextEn(e.target.value)}
          required
          minLength={5}
        />
        <input
          className="w-32 rounded-lg border border-slate-300 p-2 text-sm"
          placeholder="カテゴリ"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <button className="rounded-lg bg-[#1b2a5e] px-4 py-2 text-sm font-semibold text-white">追加</button>
        {message && <p className="w-full text-sm text-red-600">{message}</p>}
      </form>
      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">論題</th>
              <th className="p-3">カテゴリ</th>
              <th className="p-3">受験数</th>
              <th className="p-3">状態</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {motions.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="p-3">{m.textEn}</td>
                <td className="p-3">{m.category ?? "—"}</td>
                <td className="p-3">{m.assessmentCount}</td>
                <td className="p-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${m.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {m.isActive ? "出題中" : "無効"}
                  </span>
                </td>
                <td className="p-3">
                  <button onClick={() => toggle(m)} className="text-xs text-[#1b2a5e] underline">
                    {m.isActive ? "無効化" : "有効化"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
