import { z } from "zod";
import { requireAdmin } from "@/src/lib/session";
import { handler, ok, parseBody, auditLog } from "@/src/lib/api";
import { getSetting, setSetting } from "@/src/lib/settings";

const putSchema = z.object({
  "recording.retention": z.enum(["delete", "keep"]).optional(),
  "report.show_cefr": z.boolean().optional(),
  "daily_attempt_limit": z.number().int().min(1).max(100).optional(),
  "judge.model": z.string().min(1).optional(),
  "pd_level.grid": z
    .array(z.array(z.union([z.enum(["PD1", "PD2", "PD3", "PD4", "PD5", "PD6"]), z.null()])).length(11))
    .length(11)
    .optional(),
});

export const GET = handler(async () => {
  await requireAdmin();
  return ok({
    "recording.retention": await getSetting("recording.retention"),
    "report.show_cefr": await getSetting("report.show_cefr"),
    "daily_attempt_limit": await getSetting("daily_attempt_limit"),
    "judge.model": await getSetting("judge.model"),
    "pd_level.grid": await getSetting("pd_level.grid"),
  });
});

export const PUT = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const body = await parseBody(req, putSchema);
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    await setSetting(key as Parameters<typeof setSetting>[0], value, admin.id);
    await auditLog(admin.id, "settings.update", "setting", key, { value });
  }
  return ok({ updated: Object.keys(body) });
});
