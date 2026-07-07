import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import { env } from "./env";
import { prisma } from "./db";

export interface SessionData {
  userId?: string;
  role?: "examinee" | "admin";
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), {
    password: env().SESSION_SECRET,
    cookieName: "pda_session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  });
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser() {
  const session = await getSession();
  if (!session.userId) throw new ApiError(401, "unauthorized", "ログインしてください");
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new ApiError(401, "unauthorized", "ログインしてください");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new ApiError(403, "forbidden", "管理者権限が必要です");
  return user;
}
