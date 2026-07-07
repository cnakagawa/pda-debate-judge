import { z } from "zod";
import { prisma } from "@/src/lib/db";
import { requireAdmin, ApiError } from "@/src/lib/session";
import { handler, ok, parseBody, auditLog } from "@/src/lib/api";

const patchSchema = z.object({
  textEn: z.string().min(5).optional(),
  textJa: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  targetRoles: z.array(z.enum(["PM", "LO", "MG", "MO", "LOR", "PMR"])).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await parseBody(req, patchSchema);
    const motion = await prisma.motion.update({ where: { id }, data: body });
    await auditLog(admin.id, "motion.update", "motion", id, body);
    return ok({ id: motion.id });
  },
);

export const DELETE = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const count = await prisma.assessment.count({ where: { motionId: id } });
    if (count > 0) {
      // 受験実績のある論題は削除せず無効化のみ（履歴の整合性を守る）
      await prisma.motion.update({ where: { id }, data: { isActive: false } });
      await auditLog(admin.id, "motion.deactivate", "motion", id);
      throw new ApiError(409, "has_assessments", "受験実績があるため削除できません（無効化しました）");
    }
    await prisma.motion.delete({ where: { id } });
    await auditLog(admin.id, "motion.delete", "motion", id);
    return ok({ deleted: true });
  },
);
