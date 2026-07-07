import { prisma } from "@/src/lib/db";
import { requireAdmin, ApiError } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";

export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = await ctx.params;
    const a = await prisma.assessment.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        motion: true,
        transcript: true,
        deliveryMetrics: true,
        generatedSpeeches: true,
        mediaFiles: true,
        evaluations: {
          orderBy: { createdAt: "desc" },
          include: {
            items: true,
            revisions: { include: { editor: { select: { name: true } } } },
            rubricVersion: { select: { version: true } },
          },
        },
        reports: { orderBy: { issuedAt: "desc" } },
      },
    });
    if (!a) throw new ApiError(404, "not_found", "アセスメントが見つかりません");
    return ok({
      id: a.id,
      user: a.user,
      role: a.role,
      motion: a.motion.textEn,
      language: a.language,
      status: a.status,
      statusDetail: a.statusDetail,
      createdAt: a.createdAt,
      completedAt: a.completedAt,
      transcript: a.transcript
        ? { text: a.transcript.text, words: a.transcript.words, sttModel: a.transcript.sttModel }
        : null,
      deliveryMetrics: a.deliveryMetrics,
      generatedSpeeches: a.generatedSpeeches.map((g) => ({
        role: g.role,
        script: g.script,
        structure: g.structure,
        llmModel: g.llmModel,
      })),
      mediaFiles: a.mediaFiles.map((m) => ({
        kind: m.kind,
        deletedAt: m.deletedAt,
        sizeBytes: m.sizeBytes?.toString() ?? null,
        durationSec: m.durationSec,
      })),
      evaluations: a.evaluations.map((e) => ({
        id: e.id,
        source: e.source,
        isCurrent: e.isCurrent,
        matterScore: e.matterScore,
        mannerScore: e.mannerScore,
        totalScore: e.totalScore,
        matterGrade: e.matterGrade,
        mannerGrade: e.mannerGrade,
        pdLevel: e.pdLevel,
        goodPoints: e.goodPoints,
        improvementPoints: e.improvementPoints,
        overallComments: e.overallComments,
        gates: e.gates,
        llmModel: e.llmModel,
        promptVersion: e.promptVersion,
        rubricVersion: e.rubricVersion.version,
        createdAt: e.createdAt,
        items: e.items,
        revisions: e.revisions.map((r) => ({
          editor: r.editor.name,
          reason: r.reason,
          diff: r.diff,
          createdAt: r.createdAt,
        })),
      })),
      reports: a.reports.map((r) => ({ id: r.id, evaluationId: r.evaluationId, issuedAt: r.issuedAt })),
    });
  },
);
