"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

interface Me {
  id: string;
  name: string;
  role: "examinee" | "admin";
}

export default function HomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [starting, setStarting] = useState<"" | "PM" | "LO">("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Me>("/api/v1/auth/me")
      .then(setMe)
      .catch(() => router.push("/login"));
  }, [router]);

  async function start(role: "PM" | "LO") {
    setError("");
    setStarting(role);
    try {
      const a = await api<{ id: string }>("/api/v1/assessments", { method: "POST", json: { role } });
      router.push(`/assessment/${a.id}`);
    } catch (err) {
      setError((err as Error).message);
      setStarting("");
    }
  }

  if (!me) return <main className="p-10 text-center text-slate-400">読み込み中…</main>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a5e]">PD Assessment System</h1>
          <p className="text-sm text-slate-500">こんにちは、{me.name} さん</p>
        </div>
        {me.role === "admin" && (
          <a href="/admin" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
            管理者画面
          </a>
        )}
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => start("PM")}
          disabled={starting !== ""}
          className="rounded-2xl bg-[#1b2a5e] p-8 text-left text-white shadow-lg transition hover:scale-[1.01] hover:bg-[#27407f] disabled:opacity-60"
        >
          <div className="text-3xl font-bold">PM Assessment</div>
          <p className="mt-2 text-sm opacity-80">
            肯定側の最初のスピーチ（Prime Minister）に挑戦します。論題表示 → 準備5分 → スピーチ3分。
          </p>
          {starting === "PM" && <p className="mt-2 text-sm">開始しています…</p>}
        </button>
        <button
          onClick={() => start("LO")}
          disabled={starting !== ""}
          className="rounded-2xl bg-[#7a1f2b] p-8 text-left text-white shadow-lg transition hover:scale-[1.01] hover:bg-[#93303d] disabled:opacity-60"
        >
          <div className="text-3xl font-bold">LO Assessment</div>
          <p className="mt-2 text-sm opacity-80">
            AIのPMスピーチを聞いて反論する否定側スピーチ（Leader of Opposition）に挑戦します。
          </p>
          {starting === "LO" && <p className="mt-2 text-sm">開始しています…</p>}
        </button>
        <a
          href="/history"
          className="rounded-2xl bg-white p-8 shadow-lg transition hover:scale-[1.01] hover:bg-slate-50"
        >
          <div className="text-2xl font-bold text-[#1b2a5e]">Assessment History</div>
          <p className="mt-2 text-sm text-slate-500">過去の受験結果とレポートを確認します。</p>
        </a>
        <a
          href="/settings"
          className="rounded-2xl bg-white p-8 shadow-lg transition hover:scale-[1.01] hover:bg-slate-50"
        >
          <div className="text-2xl font-bold text-[#1b2a5e]">Settings</div>
          <p className="mt-2 text-sm text-slate-500">氏名・パスワードの変更、ログアウト。</p>
        </a>
      </div>

      <p className="mt-8 text-center text-xs text-slate-400">
        本システムは学習用のAIアセスメントです。公式PD検定の結果を証明するものではありません。
      </p>
    </main>
  );
}
