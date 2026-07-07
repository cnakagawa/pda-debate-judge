import { prisma } from "./db";
import { DEFAULT_PD_LEVEL_GRID, type PdLevelGrid } from "../domain/pdLevel";

export type SettingKey =
  | "recording.retention"
  | "pd_level.grid"
  | "report.show_cefr"
  | "daily_attempt_limit"
  | "judge.model";

const DEFAULTS: Record<SettingKey, unknown> = {
  "recording.retention": "delete",
  "pd_level.grid": DEFAULT_PD_LEVEL_GRID,
  "report.show_cefr": true,
  "daily_attempt_limit": 5,
  "judge.model": "claude-sonnet-5",
};

export async function getSetting<T>(key: SettingKey): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return (row?.value ?? DEFAULTS[key]) as T;
}

export async function setSetting(
  key: SettingKey,
  value: unknown,
  updatedBy?: string,
): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value: value as object, updatedBy },
    create: { key, value: value as object, updatedBy },
  });
}

export async function getPdLevelGrid(): Promise<PdLevelGrid> {
  return getSetting<PdLevelGrid>("pd_level.grid");
}

export async function getRetention(): Promise<"delete" | "keep"> {
  return getSetting<"delete" | "keep">("recording.retention");
}
