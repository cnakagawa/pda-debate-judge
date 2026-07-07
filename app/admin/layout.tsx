"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/components/api";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    api<{ role: string }>("/api/v1/auth/me")
      .then((me) => {
        if (me.role !== "admin") router.push("/");
        else setAuthorized(true);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  if (!authorized) return <main className="p-10 text-center text-slate-400">確認中…</main>;

  const nav = [
    { href: "/admin", label: "ダッシュボード" },
    { href: "/admin/motions", label: "論題管理" },
    { href: "/admin/assessments", label: "Assessment履歴" },
    { href: "/admin/settings", label: "システム設定" },
  ];

  return (
    <div className="min-h-screen">
      <nav className="bg-[#1b2a5e] text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4">
          <span className="mr-4 py-3 text-sm font-bold">PD Assessment 管理</span>
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className={`px-3 py-3 text-sm hover:bg-white/10 ${pathname === n.href ? "border-b-2 border-amber-400 font-semibold" : ""}`}
            >
              {n.label}
            </a>
          ))}
          <a href="/" className="ml-auto px-3 py-3 text-sm opacity-70 hover:opacity-100">
            受験画面へ
          </a>
        </div>
      </nav>
      <div className="mx-auto max-w-6xl p-6">{children}</div>
    </div>
  );
}
