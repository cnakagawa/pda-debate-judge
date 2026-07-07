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
  learning: {
    itemDetails: Array<{
      key: string;
      labelJa: string;
      category: string;
      grade: string;
      rationale: string;
      criteria: Array<{
        band: string;
        text: string;
        met: boolean;
        excluded: boolean;
        rationale?: string;
        evidence?: Array<{ quote: string; startSec?: number }>;
      }>;
    }>;
    speechSheet: Array<{ key: string; labelJa: string; present: boolean; quote?: string }>;
    nextLevel: {
      currentLevel: string | null;
      targetLevel: string | null;
      requirements: { matter: number; manner: number } | null;
      gaps: { matter: number; manner: number };
      recommendations: Array<{
        category: string;
        itemLabelJa: string;
        band: string;
        text: string;
        effect: string;
      }>;
    };
    previous: {
      testDate: string;
      matterScore: number;
      mannerScore: number;
      totalScore: number;
      pdLevel: string | null;
    } | null;
  };
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

      {/* ─────── 学習支援セクション ─────── */}

      {data.learning.previous && (
        <section className="mt-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-bold text-[#1b2a5e]">前回からの変化</h2>
          <div className="flex items-center gap-4 text-sm">
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">前回 {data.learning.previous.testDate}</p>
              <p className="font-bold">
                {data.learning.previous.totalScore}/20（{data.learning.previous.pdLevel ?? "判定外"}）
              </p>
            </div>
            <span className="text-2xl text-slate-400">→</span>
            <div className="rounded-lg bg-amber-50 p-3 text-center">
              <p className="text-xs text-slate-500">今回</p>
              <p className="font-bold text-amber-700">
                {data.totalScore}/20（{data.pdLevel ?? "判定外"}）
              </p>
            </div>
            <p className="text-slate-600">
              内容 {data.learning.previous.matterScore}→{data.matter.score} ／ 表現{" "}
              {data.learning.previous.mannerScore}→{data.manner.score}
            </p>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-1 text-lg font-bold text-[#1b2a5e]">
          次のレベルへのプラン
          {data.learning.nextLevel.targetLevel && (
            <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-700">
              目標: {data.learning.nextLevel.targetLevel}
            </span>
          )}
        </h2>
        {data.learning.nextLevel.targetLevel ? (
          <>
            <p className="mb-3 text-sm text-slate-600">
              {data.learning.nextLevel.targetLevel} に上がるには 内容{" "}
              <b>{data.learning.nextLevel.requirements!.matter}点以上</b>・表現{" "}
              <b>{data.learning.nextLevel.requirements!.manner}点以上</b> が必要です（あと 内容+
              {data.learning.nextLevel.gaps.matter}点・表現+{data.learning.nextLevel.gaps.manner}点）。
              以下はPDAルーブリックの中で、まだ満たせていない項目です。次の練習で意識しましょう。
            </p>
            <ul className="space-y-2">
              {data.learning.nextLevel.recommendations.map((r, i) => (
                <li key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-bold ${r.category === "matter" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                    {r.category === "matter" ? "内容" : "表現"} / {r.itemLabelJa}・{r.band}
                  </span>
                  {r.text}
                  <span className="mt-1 block text-xs text-slate-400">{r.effect}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            最上位レベル（PD1）に到達しています。この水準を維持できるよう練習を続けましょう。
          </p>
        )}
      </section>

      <section className="mt-6 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-1 text-lg font-bold text-[#1b2a5e]">スピーチシート・チェック</h2>
        <p className="mb-3 text-xs text-slate-500">
          この役割のスピーチに求められる構成要素が入っていたかのチェックです。
        </p>
        <ul className="space-y-2">
          {data.learning.speechSheet.map((s) => (
            <li key={s.key} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm">
              <span className={`mt-0.5 font-bold ${s.present ? "text-green-600" : "text-red-500"}`}>
                {s.present ? "✓" : "✗"}
              </span>
              <div>
                <p className="font-semibold">{s.labelJa}</p>
                {s.present && s.quote ? (
                  <p className="mt-1 border-l-2 border-slate-300 pl-2 text-xs italic text-slate-500">
                    “{s.quote}”
                  </p>
                ) : !s.present ? (
                  <p className="mt-1 text-xs text-red-500">スピーチの中で確認できませんでした。</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-1 text-lg font-bold text-[#1b2a5e]">評価の根拠を見る</h2>
        <p className="mb-3 text-xs text-slate-500">
          8つの評価項目それぞれについて、PDAルーブリックのどの基準を満たしたか／満たせなかったかを確認できます。
        </p>
        {data.learning.itemDetails.map((item) => (
          <details key={item.key} className="mb-2 rounded-lg border border-slate-200">
            <summary className="flex cursor-pointer items-center justify-between p-3">
              <span className="text-sm font-semibold">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-bold ${item.category === "matter" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                  {item.category === "matter" ? "内容" : "表現"}
                </span>
                {item.labelJa}
              </span>
              <span className={`text-lg font-extrabold ${gradeColorClass(item.grade)}`}>{item.grade}</span>
            </summary>
            <div className="border-t border-slate-100 p-3">
              {item.criteria
                .filter((c) => !c.excluded)
                .map((c, i) => (
                  <div key={i} className="mb-2 rounded-lg bg-slate-50 p-2 text-xs">
                    <p>
                      <span className={`mr-1 font-bold ${c.met ? "text-green-600" : "text-red-500"}`}>
                        {c.met ? "✓" : "✗"}
                      </span>
                      <span className="mr-1 rounded bg-slate-200 px-1 font-mono text-[10px]">{c.band}</span>
                      {c.text}
                    </p>
                    {c.rationale && <p className="mt-1 pl-4 text-slate-500">{c.rationale}</p>}
                    {c.evidence?.map((ev, j) => (
                      <p key={j} className="mt-1 border-l-2 border-slate-300 pl-2 italic text-slate-500">
                        “{ev.quote}”
                      </p>
                    ))}
                  </div>
                ))}
            </div>
          </details>
        ))}
      </section>
    </main>
  );
}
