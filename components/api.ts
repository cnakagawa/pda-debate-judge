"use client";

/** クライアント側のAPI呼び出しヘルパー */
export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message = payload?.error?.message ?? `エラーが発生しました (${res.status})`;
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = payload?.error?.code;
    throw err;
  }
  return payload.data as T;
}

export function gradeColorClass(grade: string): string {
  switch (grade) {
    case "S": return "text-amber-600";
    case "A": return "text-blue-600";
    case "B": return "text-green-600";
    default: return "text-slate-500";
  }
}
