import type { PrismaClient } from "@prisma/client";
import { makePdf, makeStorage } from "../adapters/providers";
import { getSetting } from "../lib/settings";

export interface ReportData {
  reportTitle: "PD Assessment Report";
  name: string;
  testDate: string;
  motion: string;
  role: string;
  roleLabel: string;
  language: string;
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
  evaluationSource: string;
  rubricVersion: string;
}

const ITEM_LABELS: Record<string, { ja: string; en: string }> = {
  reasoning: { ja: "主張の理由", en: "Reasoning" },
  example: { ja: "具体例", en: "Example" },
  relevancy: { ja: "論題との関連性", en: "Relevancy" },
  role_strategy: { ja: "スピーカーの役割・戦略性", en: "Role and Strategy" },
  attitude: { ja: "態度・話す姿勢", en: "Attitude" },
  eye_contact_gesture: { ja: "アイコンタクト・ジェスチャー", en: "Eye Contact and Gestures" },
  clarity: { ja: "明瞭性", en: "Clarity" },
  time_management: { ja: "タイムマネジメント", en: "Time Management" },
};

const ROLE_LABELS: Record<string, string> = {
  PM: "PM (Prime Minister)",
  LO: "LO (Leader of Opposition)",
  MG: "MG (Member of Government)",
  MO: "MO (Member of Opposition)",
  LOR: "LOR (Leader of Opposition Reply)",
  PMR: "PMR (Prime Minister Reply)",
};

export async function buildReportData(
  prisma: PrismaClient,
  assessmentId: string,
  evaluationId?: string,
): Promise<ReportData> {
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    include: { user: true, motion: true },
  });
  const evaluation = evaluationId
    ? await prisma.evaluation.findUniqueOrThrow({
        where: { id: evaluationId },
        include: { items: true, rubricVersion: true },
      })
    : await prisma.evaluation.findFirstOrThrow({
        where: { assessmentId, isCurrent: true },
        include: { items: true, rubricVersion: true },
      });

  const showCefr = await getSetting<boolean>("report.show_cefr");

  const order = [
    "reasoning",
    "example",
    "relevancy",
    "role_strategy",
    "attitude",
    "eye_contact_gesture",
    "clarity",
    "time_management",
  ];
  const items = order
    .map((key) => {
      const item = evaluation.items.find((i) => i.itemKey === key);
      if (!item) return null;
      const labels = ITEM_LABELS[key]!;
      return {
        key,
        labelJa: labels.ja,
        labelEn: labels.en,
        category: item.category,
        grade: item.grade,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    reportTitle: "PD Assessment Report",
    name: assessment.user.name,
    testDate: (assessment.completedAt ?? assessment.createdAt).toISOString().slice(0, 10),
    motion: assessment.language === "ja" && assessment.motion.textJa
      ? assessment.motion.textJa
      : assessment.motion.textEn,
    role: assessment.role,
    roleLabel: ROLE_LABELS[assessment.role] ?? assessment.role,
    language: assessment.language,
    matter: { score: evaluation.matterScore, grade: evaluation.matterGrade },
    manner: { score: evaluation.mannerScore, grade: evaluation.mannerGrade },
    totalScore: evaluation.totalScore,
    pdLevel: evaluation.pdLevel,
    cefrReference: evaluation.cefrReference,
    showCefr,
    items,
    goodPoints: evaluation.goodPoints,
    improvementPoints: evaluation.improvementPoints,
    overallComments: evaluation.overallComments,
    notes: [
      "本レポートはAIによる学習用アセスメントの結果であり、公式PD検定の合否・級を証明するものではありません。",
      "Web受験版（1人受験）のため、POI（Point of Information）は評価対象外です。",
    ],
    evaluationSource: evaluation.source,
    rubricVersion: evaluation.rubricVersion.version,
  };
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "S": return "#c9a227";
    case "A": return "#2563eb";
    case "B": return "#16a34a";
    default: return "#6b7280";
  }
}

/** PD Assessment Report のHTMLテンプレート（証明書サンプルのレイアウトを踏襲、名称は変更） */
export function renderReportHtml(d: ReportData): string {
  const matterItems = d.items.filter((i) => i.category === "matter");
  const mannerItems = d.items.filter((i) => i.category === "manner");
  const itemRow = (i: ReportData["items"][number]) => `
    <tr>
      <td class="item-name">${esc(i.labelJa)}<span class="item-en">${esc(i.labelEn)}</span></td>
      <td class="item-grade" style="color:${gradeColor(i.grade)}">${esc(i.grade)}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif;
    color: #1f2937; width: 210mm; min-height: 297mm; padding: 12mm;
    background: #fff;
  }
  .frame { border: 3px double #1b2a5e; border-radius: 4px; padding: 10mm; min-height: 273mm; position: relative; }
  .header { text-align: center; border-bottom: 2px solid #c9a227; padding-bottom: 6mm; margin-bottom: 6mm; }
  .org { font-size: 10px; color: #6b7280; letter-spacing: 1px; }
  h1 { font-size: 26px; color: #1b2a5e; letter-spacing: 2px; margin: 2mm 0 1mm; }
  .subtitle { font-size: 11px; color: #6b7280; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 8mm; margin-bottom: 5mm; font-size: 12px; }
  .meta .full { grid-column: 1 / -1; }
  .meta dt { color: #6b7280; font-size: 10px; }
  .meta dd { font-size: 13px; font-weight: 600; border-bottom: 1px solid #e5e7eb; padding: 1mm 0 1.5mm; }
  .scores { display: flex; gap: 4mm; margin-bottom: 5mm; }
  .score-card { flex: 1; text-align: center; border: 1.5px solid #1b2a5e; border-radius: 4px; padding: 3mm; }
  .score-card .label { font-size: 10px; color: #6b7280; }
  .score-card .value { font-size: 22px; font-weight: 700; color: #1b2a5e; }
  .score-card .grade { font-size: 12px; font-weight: 700; }
  .level-card { flex: 1.2; text-align: center; border: 2px solid #c9a227; border-radius: 4px; padding: 3mm; background: #fffbeb; }
  .level-card .value { font-size: 26px; font-weight: 800; color: #92400e; }
  .cefr { font-size: 9px; color: #6b7280; }
  .items { display: flex; gap: 6mm; margin-bottom: 5mm; }
  .items-col { flex: 1; }
  .items-col h3 { font-size: 12px; color: #1b2a5e; border-bottom: 1.5px solid #1b2a5e; padding-bottom: 1mm; margin-bottom: 2mm; }
  .items table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .items td { padding: 1.6mm 1mm; border-bottom: 1px solid #e5e7eb; }
  .item-en { display: block; font-size: 8px; color: #9ca3af; }
  .item-grade { text-align: right; font-size: 15px; font-weight: 800; width: 12mm; }
  .comment { margin-bottom: 3.5mm; }
  .comment h3 { font-size: 12px; color: #1b2a5e; margin-bottom: 1mm; }
  .comment p { font-size: 10.5px; line-height: 1.7; background: #f9fafb; border-left: 3px solid #c9a227; padding: 2mm 3mm; }
  .notes { margin-top: 5mm; font-size: 8px; color: #9ca3af; line-height: 1.6; border-top: 1px solid #e5e7eb; padding-top: 2mm; }
</style>
</head>
<body>
<div class="frame">
  <div class="header">
    <div class="org">一般社団法人 パーラメンタリーディベート人財育成協会（PDA）</div>
    <h1>PD Assessment Report</h1>
    <div class="subtitle">PD検定アセスメント版 — AI Assessment Result</div>
  </div>

  <dl class="meta">
    <div><dt>Name / 氏名</dt><dd>${esc(d.name)}</dd></div>
    <div><dt>Test Date / 受験日</dt><dd>${esc(d.testDate)}</dd></div>
    <div class="full"><dt>Motion / 論題</dt><dd>${esc(d.motion)}</dd></div>
    <div><dt>Role / 役割</dt><dd>${esc(d.roleLabel)}</dd></div>
    <div><dt>Language / 言語</dt><dd>${d.language === "en" ? "English" : "日本語"}</dd></div>
  </dl>

  <div class="scores">
    <div class="score-card">
      <div class="label">Matter / 内容</div>
      <div class="value">${d.matter.score}<span style="font-size:12px">/10</span></div>
      <div class="grade" style="color:${gradeColor(d.matter.grade)}">${esc(d.matter.grade)}</div>
    </div>
    <div class="score-card">
      <div class="label">Manner / 表現</div>
      <div class="value">${d.manner.score}<span style="font-size:12px">/10</span></div>
      <div class="grade" style="color:${gradeColor(d.manner.grade)}">${esc(d.manner.grade)}</div>
    </div>
    <div class="score-card">
      <div class="label">Total Score / 合計</div>
      <div class="value">${d.totalScore}<span style="font-size:12px">/20</span></div>
      <div class="grade">&nbsp;</div>
    </div>
    <div class="level-card">
      <div class="label">PD Level</div>
      <div class="value">${d.pdLevel ? esc(d.pdLevel) : "—"}</div>
      ${d.showCefr && d.cefrReference ? `<div class="cefr">CEFR目安: ${esc(d.cefrReference)}</div>` : ""}
    </div>
  </div>

  <div class="items">
    <div class="items-col">
      <h3>Matter / 内容</h3>
      <table>${matterItems.map(itemRow).join("")}</table>
    </div>
    <div class="items-col">
      <h3>Manner / 表現</h3>
      <table>${mannerItems.map(itemRow).join("")}</table>
    </div>
  </div>

  <div class="comment"><h3>Good Points / 良かった点</h3><p>${esc(d.goodPoints)}</p></div>
  <div class="comment"><h3>Improvement Points / 改善点</h3><p>${esc(d.improvementPoints)}</p></div>
  <div class="comment"><h3>Overall Comments / 総評</h3><p>${esc(d.overallComments)}</p></div>

  <div class="notes">
    ${d.notes.map((n) => `※ ${esc(n)}`).join("<br>")}
    <br>Rubric: ${esc(d.rubricVersion)} ／ Evaluation: ${d.evaluationSource === "ai" ? "AI" : "AI + 管理者確認済み"}
  </div>
</div>
</body>
</html>`;
}

/** PDFを生成して保存し、reportsレコードを作成する */
export async function issueReportPdf(
  prisma: PrismaClient,
  assessmentId: string,
  evaluationId: string,
  issuedById?: string,
): Promise<{ reportId: string; storageKey: string }> {
  const data = await buildReportData(prisma, assessmentId, evaluationId);
  const pdf = await makePdf().renderHtmlToPdf(renderReportHtml(data));
  const storageKey = `reports/${assessmentId}/${evaluationId}.pdf`;
  await makeStorage().put(storageKey, pdf, "application/pdf");
  const report = await prisma.report.create({
    data: { assessmentId, evaluationId, storageKey, issuedById },
  });
  return { reportId: report.id, storageKey };
}
