import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/src/lib/db";
import { getSession } from "@/src/lib/session";
import { handler, ok, fail, parseBody } from "@/src/lib/api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, schema);
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    return fail(401, "invalid_credentials", "メールアドレスまたはパスワードが違います");
  }
  const session = await getSession();
  session.userId = user.id;
  session.role = user.role;
  await session.save();
  return ok({ id: user.id, name: user.name, email: user.email, role: user.role });
});
