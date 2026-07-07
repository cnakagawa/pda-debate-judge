import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/src/lib/db";
import { requireUser } from "@/src/lib/session";
import { handler, ok, parseBody } from "@/src/lib/api";

export const GET = handler(async () => {
  const user = await requireUser();
  return ok({ id: user.id, name: user.name, email: user.email, role: user.role });
});

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  password: z.string().min(8).max(200).optional(),
});

export const PATCH = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseBody(req, patchSchema);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}),
    },
  });
  return ok({ updated: true });
});
