"use client";

import { use, useEffect, useState } from "react";
import { api, gradeColorClass } from "@/components/api";

interface ReportData {
  name: string;
  testDate: string;
  motion: string;
  roleLabel: string;
  matter: { score: number; grade: string };
  manner: { score: number; grade: string };
  totalScore: number;
  pdLevel: string | null;
  cefrReference: string | null;
  showCefr: boolean;
  items: Array<{ key: string; labelJa: string; labelEn: string; category: string; grade: string }>;
  goodPoints: string;
  improvementPoints: string;
  overallComments: string;
  notes: string[];
}

export default function ReportPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ReportData>(`/api/v1/assessments/${id}/report`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-10 text-center">
        <p className="mb-4 text-red-700">{error}</p>
        <a href="/" className="text-[#1b2a5e] underline">ホームに戻る</a>
      </main>
    );
  }
  if (!data) return <main className="p-10 text-center text-slate-400">読み込み中…</main>;

  const matterItems = data.items.filter((i) => i.category === "matter");
  const mannerItems = data.items.filter((i) => i.category === "manner");

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <a href="/" className="text-sm text-slate-500 hover:underline">← ホーム</a>
        <a
          href={`/api/v1/assessments/${id}/report.pdf`}
          className="rounded-lg bg-[#1b2a5e] px-5 py-2.5 text-sm font-semibold text-white"
        >
          PDFをダウンロード
        </a>
      </header>

      <div className="rounded-2xl border-4 border-double border-[#1b2a5e] bg-white p-8 shadow-lg">
        <div className="mb-6 border-b-2 border-amber-500 pb-4 text-center">
          <p className="text-xs tracking-wide text-slate-500">
            一般社団法人 パーラメンタリーディベート人財育成協会（PDA）
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-wide text-[#1b2a5e]">PD Assessment Report</h1>
          <p className="text-xs text-slate-500">PD検定アセスメント版 — AI Assessment Result</p>
        </div>

        <dl className="mb-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Name / 氏名</dt>
            <dd className="border-b border-slate-200 pb-1 font-semibold">{data.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Test Date / 受験日</dt>
            <dd className="border-b border-slate-200 pb-1 font-semibold">{data.testDate}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">Motion / 論題</dt>
            <dd className="border-b border-slate-200 pb-1 font-semibold">{data.motion}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Role / 役割</dt>
            <dd className="border-b border-slate-200 pb-1 font-semibold">{data.roleLabel}</dd>
          </div>
        </dl>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border-2 border-[#1b2a5e] p-3 text-center">
            <p className="text-xs text-slate-500">Matter / 内容</p>
            <p className="text-2xl font-bold text-[#1b2a5e]">
              {data.matter.score}<span className="text-sm">/10</span>
            </p>
            <p className={`font-bold ${gradeColorClass(data.matter.grade)}`}>{data.matter.grade}</p>
          </div>
          <div className="rounded-lg border-2 border-[#1b2a5e] p-3 text-center">
            <p className="text-xs text-slate-500">Manner / 表現</p>
            <p className="text-2xl font-bold text-[#1b2a5e]">
              {data.manner.score}<span className="text-sm">/10</span>
            </p>
            <p className={`font-bold ${gradeColorClass(data.manner.grade)}`}>{data.manner.grade}</p>
          </div>
          <div className="rounded-lg border-2 border-[#1b2a5e] p-3 text-center">
            <p className="text-xs text-slate-500">Total Score</p>
            <p className="text-2xl font-bold text-[#1b2a5e]">
              {data.totalScore}<span className="text-sm">/20</span>
            </p>
          </div>
          <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-center">
            <p className="text-xs text-slate-500">PD Level</p>
            <p className="text-2xl font-extrabold text-amber-700">{data.pdLevel ?? "—"}</p>
            {data.showCefr && data.cefrReference && (
              <p className="text-[10px] text-slate-500">CEFR目安: {data.cefrReference}</p>
            )}
          </div>
        </div>

        <div className="mb-6 grid gap-6 sm:grid-cols-2">
          {[
            { title: "Matter / 内容", items: matterItems },
            { title: "Manner / 表現", items: mannerItems },
          ].map((col) => (
            <div key={col.title}>
              <h3 className="mb-2 border-b-2 border-[#1b2a5e] pb-1 text-sm font-bold text-[#1b2a5e]">
                {col.title}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {col.items.map((i) => (
                    <tr key={i.key} className="border-b border-slate-100">
                      <td className="py-2">
                        {i.labelJa}
                        <span className="block text-[10px] text-slate-400">{i.labelEn}</span>
                      </td>
                      <td className={`py-2 text-right text-lg font-extrabold ${gradeColorClass(i.grade)}`}>
                        {i.grade}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {[
          { title: "Good Points / 良かった点", body: data.goodPoints },
          { title: "Improvement Points / 改善点", body: data.improvementPoints },
          { title: "Overall Comments / 総評", body: data.overallComments },
        ].map((c) => (
          <div key={c.title} className="mb-4">
            <h3 className="mb-1 text-sm font-bold text-[#1b2a5e]">{c.title}</h3>
            <p className="rounded border-l-4 border-amber-500 bg-slate-50 p-3 text-sm leading-relaxed">
              {c.body}
            </p>
          </div>
        ))}

        <div className="mt-6 border-t border-slate-200 pt-3 text-[10px] leading-relaxed text-slate-400">
          {data.notes.map((n) => (
            <p key={n}>※ {n}</p>
          ))}
        </div>
      </div>
    </main>
  );
}
