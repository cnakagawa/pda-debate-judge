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

  const [bulkText, setBulkText] = useState("");
  async function bulkImport(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    // 1行1論題。「論題 | カテゴリ」の形式でカテゴリを付けられる
    const motions = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= 5)
      .map((l) => {
        const [textEn, category] = l.split("|").map((s) => s.trim());
        return { textEn: textEn!, ...(category ? { category } : {}) };
      });
    if (motions.length === 0) {
      setMessage("投入する論題がありません（1行1論題で入力してください）");
      return;
    }
    try {
      const res = await api<{ imported: number; skipped: number }>(
        "/api/v1/admin/motions/bulk",
        { method: "POST", json: { motions } },
      );
      setMessage(`${res.imported}件を登録しました（重複スキップ ${res.skipped}件）`);
      setBulkText("");
      load();
    } catch (err) {
      setMessage((err as Error).message);
    }
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
      <details className="mb-6 rounded-xl bg-white p-4 shadow">
        <summary className="cursor-pointer text-sm font-semibold text-[#1b2a5e]">
          一括投入（PDA提供の論題リスト用）
        </summary>
        <form onSubmit={bulkImport} className="mt-3">
          <p className="mb-2 text-xs text-slate-500">
            1行に1論題を貼り付けてください。「論題 | カテゴリ」の形式でカテゴリも指定できます。重複は自動でスキップされます。
          </p>
          <textarea
            className="mb-2 h-40 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"We should ban ... | 環境\nWe should introduce ... | 社会"}
          />
          <button className="rounded-lg bg-[#1b2a5e] px-4 py-2 text-sm font-semibold text-white">
            一括登録
          </button>
        </form>
      </details>
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
