import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError } from "./session";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** ルートハンドラの共通エラーハンドリング */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse | Response>,
): (...args: Args) => Promise<NextResponse | Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, err.code, err.message);
      if (err instanceof ZodError) {
        return fail(400, "validation_error", err.issues.map((i) => i.message).join(", "));
      }
      console.error("[api]", err);
      return fail(500, "internal_error", "サーバーエラーが発生しました");
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const body = await req.json().catch(() => {
    throw new ApiError(400, "invalid_json", "リクエストボディが不正です");
  });
  return schema.parse(body);
}

export async function auditLog(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  payload: unknown = {},
) {
  const { prisma } = await import("./db");
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      targetType,
      targetId,
      payload: payload as object,
    },
  });
}
