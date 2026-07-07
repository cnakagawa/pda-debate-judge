"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api("/api/v1/auth/register", { method: "POST", json: { name, email, password } });
      } else {
        await api("/api/v1/auth/login", { method: "POST", json: { email, password } });
      }
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-center text-2xl font-bold text-[#1b2a5e]">PD Assessment System</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          PDA パーラメンタリーディベート AIアセスメント
        </p>
        <div className="mb-6 flex rounded-lg bg-slate-100 p-1 text-sm">
          <button
            className={`flex-1 rounded-md py-2 ${mode === "login" ? "bg-white font-semibold shadow" : "text-slate-500"}`}
            onClick={() => setMode("login")}
          >
            ログイン
          </button>
          <button
            className={`flex-1 rounded-md py-2 ${mode === "register" ? "bg-white font-semibold shadow" : "text-slate-500"}`}
            onClick={() => setMode("register")}
          >
            新規登録
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && (
            <label className="block">
              <span className="text-sm font-medium">氏名（レポートに印字されます）</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}
          <label className="block">
            <span className="text-sm font-medium">メールアドレス</span>
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">パスワード{mode === "register" && "（8文字以上）"}</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === "register" ? 8 : 1}
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-lg bg-[#1b2a5e] py-3 font-semibold text-white hover:bg-[#27407f] disabled:opacity-50"
          >
            {busy ? "処理中…" : mode === "login" ? "ログイン" : "登録して始める"}
          </button>
        </form>
      </div>
    </main>
  );
}
