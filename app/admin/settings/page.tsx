"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";

type Grid = (string | null)[][];

interface Settings {
  "recording.retention": "delete" | "keep";
  "report.show_cefr": boolean;
  "daily_attempt_limit": number;
  "judge.model": string;
  "pd_level.grid": Grid;
}

const LEVEL_COLORS: Record<string, string> = {
  PD1: "bg-red-500 text-white",
  PD2: "bg-orange-400 text-white",
  PD3: "bg-yellow-300",
  PD4: "bg-lime-300",
  PD5: "bg-green-500 text-white",
  PD6: "bg-sky-400 text-white",
};

export default function AdminSettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Settings>("/api/v1/admin/settings").then(setS).catch(console.error);
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    setMessage("");
    try {
      await api("/api/v1/admin/settings", {
        method: "PUT",
        json: {
          "recording.retention": s["recording.retention"],
          "report.show_cefr": s["report.show_cefr"],
          "daily_attempt_limit": s["daily_attempt_limit"],
          "judge.model": s["judge.model"],
        },
      });
      setMessage("保存しました");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <p className="text-slate-400">読み込み中…</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-xl font-bold text-[#1b2a5e]">システム設定</h1>
      {message && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm">{message}</p>}

      <section className="mb-4 space-y-4 rounded-xl bg-white p-6 shadow">
        <label className="flex items-center justify-between">
          <span>
            <span className="font-semibold">録画保存</span>
            <span className="block text-xs text-slate-500">
              OFF（既定）: 採点完了後に録画・音声を自動削除 ／ ON: 保存し続ける
            </span>
          </span>
          <select
            value={s["recording.retention"]}
            onChange={(e) => setS({ ...s, "recording.retention": e.target.value as "delete" | "keep" })}
            className="rounded-lg border border-slate-300 p-2 text-sm"
          >
            <option value="delete">OFF（採点後に削除）</option>
            <option value="keep">ON（保存する）</option>
          </select>
        </label>
        <label className="flex items-center justify-between">
          <span>
            <span className="font-semibold">レポートにCEFR目安を表示</span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={s["report.show_cefr"]}
            onChange={(e) => setS({ ...s, "report.show_cefr": e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="font-semibold">1日あたりの受験回数上限</span>
          <input
            type="number"
            min={1}
            max={100}
            value={s["daily_attempt_limit"]}
            onChange={(e) => setS({ ...s, "daily_attempt_limit": parseInt(e.target.value || "1", 10) })}
            className="w-24 rounded-lg border border-slate-300 p-2 text-sm"
          />
        </label>
        <label className="flex items-center justify-between">
          <span>
            <span className="font-semibold">採点モデル</span>
            <span className="block text-xs text-slate-500">AI_DRIVER=real の場合に使用されるClaudeモデル</span>
          </span>
          <input
            value={s["judge.model"]}
            onChange={(e) => setS({ ...s, "judge.model": e.target.value })}
            className="w-56 rounded-lg border border-slate-300 p-2 text-sm"
          />
        </label>
        <button
          onClick={save}
          disabled={busy}
          className="w-full rounded-lg bg-[#1b2a5e] py-3 font-semibold text-white disabled:opacity-50"
        >
          保存
        </button>
      </section>

      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-2 font-semibold">PD Level 換算マトリクス（PDA提供・閲覧）</h2>
        <p className="mb-3 text-xs text-slate-500">
          縦: 表現（Manner）0〜10 ／ 横: 内容（Matter）0〜10。変更が必要な場合はAPI（PUT /api/v1/admin/settings）から更新します。
        </p>
        <div className="overflow-x-auto">
          <table className="border-collapse text-center text-[10px]">
            <thead>
              <tr>
                <th className="p-1 text-slate-400">表現\内容</th>
                {Array.from({ length: 11 }, (_, m) => (
                  <th key={m} className="p-1 text-slate-400">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s["pd_level.grid"].map((row, manner) => (
                <tr key={manner}>
                  <th className="p-1 text-slate-400">{manner}</th>
                  {row.map((level, matter) => (
                    <td
                      key={matter}
                      className={`h-7 w-9 border border-slate-200 font-semibold ${level ? LEVEL_COLORS[level] : "bg-slate-100 text-slate-300"}`}
                    >
                      {level ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
