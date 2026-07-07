"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

export default function SettingsPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ name: string }>("/api/v1/auth/me")
      .then((me) => setName(me.name))
      .catch(() => router.push("/login"));
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      await api("/api/v1/auth/me", {
        method: "PATCH",
        json: { name, ...(password ? { password } : {}) },
      });
      setMessage("保存しました");
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1b2a5e]">Settings</h1>
        <a href="/" className="text-sm text-slate-500 hover:underline">← ホーム</a>
      </header>
      <form onSubmit={save} className="space-y-4 rounded-2xl bg-white p-6 shadow">
        <label className="block">
          <span className="text-sm font-medium">氏名（レポートに印字されます）</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">新しいパスワード（変更する場合のみ・8文字以上）</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
          />
        </label>
        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded-lg bg-[#1b2a5e] py-3 font-semibold text-white">保存</button>
      </form>
      <button
        onClick={logout}
        className="mt-4 w-full rounded-lg border border-slate-300 py-3 text-sm text-slate-600 hover:bg-slate-100"
      >
        ログアウト
      </button>
    </main>
  );
}
