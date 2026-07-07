import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PD Assessment System",
  description: "PDA パーラメンタリーディベート AIアセスメント（PD検定アセスメント版）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
