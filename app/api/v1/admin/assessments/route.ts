import { prisma } from "@/src/lib/db";
import { requireAdmin } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";
import type { Prisma } from "@prisma/client";

export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const role = url.searchParams.get("role");
  const q = url.searchParams.get("q");
  const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10), 1);
  const perPage = 30;

  const where: Prisma.AssessmentWhereInput = {};
  if (status) where.status = status as Prisma.AssessmentWhereInput["status"];
  if (role) where.role = role as Prisma.AssessmentWhereInput["role"];
  if (q) where.user = { OR: [{ name: { contains: q } }, { email: { contains: q } }] };

  const [total, assessments] = await Promise.all([
    prisma.assessment.count({ where }),
    prisma.assessment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        user: { select: { name: true, email: true } },
        motion: { select: { textEn: true } },
        evaluations: { where: { isCurrent: true }, select: { totalScore: true, pdLevel: true, source: true } },
      },
    }),
  ]);

  return ok({
    total,
    page,
    perPage,
    items: assessments.map((a) => ({
      id: a.id,
      userName: a.user.name,
      userEmail: a.user.email,
      role: a.role,
      motion: a.motion.textEn,
      status: a.status,
      createdAt: a.createdAt,
      totalScore: a.evaluations[0]?.totalScore ?? null,
      pdLevel: a.evaluations[0]?.pdLevel ?? null,
      evaluationSource: a.evaluations[0]?.source ?? null,
    })),
  });
});
