import { z } from "zod";
import { prisma } from "@/src/lib/db";
import { requireAdmin } from "@/src/lib/session";
import { handler, ok, parseBody, auditLog } from "@/src/lib/api";

const createSchema = z.object({
  textEn: z.string().min(5),
  textJa: z.string().optional(),
  category: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  targetRoles: z.array(z.enum(["PM", "LO", "MG", "MO", "LOR", "PMR"])).default(["PM", "LO"]),
  isActive: z.boolean().default(true),
});

export const GET = handler(async () => {
  await requireAdmin();
  const motions = await prisma.motion.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { assessments: true } } },
  });
  return ok(
    motions.map((m) => ({
      id: m.id,
      textEn: m.textEn,
      textJa: m.textJa,
      category: m.category,
      difficulty: m.difficulty,
      targetRoles: m.targetRoles,
      isActive: m.isActive,
      assessmentCount: m._count.assessments,
    })),
  );
});

export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const body = await parseBody(req, createSchema);
  const motion = await prisma.motion.create({
    data: { ...body, createdById: admin.id },
  });
  await auditLog(admin.id, "motion.create", "motion", motion.id, body);
  return ok({ id: motion.id });
});
