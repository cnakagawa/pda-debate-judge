import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/src/lib/db";
import { getSession } from "@/src/lib/session";
import { handler, ok, fail, parseBody } from "@/src/lib/api";

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, schema);
  const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (existing) return fail(409, "email_taken", "このメールアドレスは既に登録されています");
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash: await bcrypt.hash(body.password, 10),
      role: "examinee",
    },
  });
  const session = await getSession();
  session.userId = user.id;
  session.role = user.role;
  await session.save();
  return ok({ id: user.id, name: user.name, email: user.email, role: user.role });
});
