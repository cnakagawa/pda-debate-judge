import { z } from "zod";
import { prisma } from "@/src/lib/db";
import { requireAdmin } from "@/src/lib/session";
import { handler, ok, parseBody, auditLog } from "@/src/lib/api";

const schema = z.object({
  motions: z
    .array(
      z.object({
        textEn: z.string().min(5),
        textJa: z.string().optional(),
        category: z.string().optional(),
        difficulty: z.number().int().min(1).max(5).optional(),
      }),
    )
    .min(1)
    .max(500),
  targetRoles: z.array(z.enum(["PM", "LO", "MG", "MO", "LOR", "PMR"])).default(["PM", "LO"]),
});

/** 論題の一括投入（PDA提供の正式論題リスト用）。既存と同一文言の論題はスキップ */
export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const body = await parseBody(req, schema);

  const existing = new Set(
    (await prisma.motion.findMany({ select: { textEn: true } })).map((m) =>
      m.textEn.trim().toLowerCase(),
    ),
  );
  const fresh = body.motions.filter((m) => !existing.has(m.textEn.trim().toLowerCase()));

  if (fresh.length > 0) {
    await prisma.motion.createMany({
      data: fresh.map((m) => ({
        textEn: m.textEn.trim(),
        textJa: m.textJa,
        category: m.category,
        difficulty: m.difficulty,
        targetRoles: body.targetRoles ?? ["PM", "LO"],
        isActive: true,
        createdById: admin.id,
      })),
    });
  }
  await auditLog(admin.id, "motion.bulk_import", "motion", "bulk", {
    imported: fresh.length,
    skipped: body.motions.length - fresh.length,
  });
  return ok({ imported: fresh.length, skipped: body.motions.length - fresh.length });
});
