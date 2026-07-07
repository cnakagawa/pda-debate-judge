import { prisma } from "@/src/lib/db";
import { requireAdmin } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";

export const GET = handler(async () => {
  await requireAdmin();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const [total, last30, failed, processing, users] = await Promise.all([
    prisma.assessment.count({ where: { status: "scored" } }),
    prisma.assessment.count({ where: { status: "scored", completedAt: { gte: since } } }),
    prisma.assessment.count({ where: { status: "failed" } }),
    prisma.assessment.count({ where: { status: "processing" } }),
    prisma.user.count({ where: { role: "examinee" } }),
  ]);
  const recent = await prisma.assessment.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      user: { select: { name: true } },
      evaluations: { where: { isCurrent: true }, select: { totalScore: true, pdLevel: true } },
    },
  });
  return ok({
    totalScored: total,
    scoredLast30Days: last30,
    failedCount: failed,
    processingCount: processing,
    examineeCount: users,
    recent: recent.map((a) => ({
      id: a.id,
      userName: a.user.name,
      role: a.role,
      status: a.status,
      createdAt: a.createdAt,
      totalScore: a.evaluations[0]?.totalScore ?? null,
      pdLevel: a.evaluations[0]?.pdLevel ?? null,
    })),
  });
});
