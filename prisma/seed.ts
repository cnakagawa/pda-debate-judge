import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { RUBRIC_2020_07_10_V1 } from "../src/domain/rubric";
import { ROLE_SPECS } from "../src/domain/roleSpecs";
import { DEFAULT_PD_LEVEL_GRID } from "../src/domain/pdLevel";
import { JUDGE_PROMPT_VERSION } from "../src/ai/prompts";

const prisma = new PrismaClient();

/** 初期論題（PDA提供リストが届くまでの動作確認用。管理者画面から追加・無効化可能） */
const INITIAL_MOTIONS: Array<{ textEn: string; category: string; difficulty: number }> = [
  { textEn: "We should ban smartphones in elementary schools.", category: "教育", difficulty: 1 },
  { textEn: "We should make school lunches free for all students.", category: "教育", difficulty: 1 },
  { textEn: "We should abolish school uniforms.", category: "教育", difficulty: 1 },
  { textEn: "We should ban single-use plastics.", category: "環境", difficulty: 2 },
  { textEn: "We should introduce a four-day work week.", category: "社会", difficulty: 2 },
  { textEn: "We should lower the voting age to 16.", category: "政治", difficulty: 2 },
  { textEn: "We should ban junk food advertisements aimed at children.", category: "健康", difficulty: 2 },
  { textEn: "We should require all high school students to do volunteer work.", category: "教育", difficulty: 1 },
  { textEn: "We should replace paper textbooks with digital textbooks.", category: "教育", difficulty: 1 },
  { textEn: "We should prohibit convenience stores from operating 24 hours.", category: "社会", difficulty: 2 },
];

async function main() {
  // ルーブリック（バージョン管理）
  await prisma.rubricVersion.upsert({
    where: { version: RUBRIC_2020_07_10_V1.version },
    update: {
      definition: RUBRIC_2020_07_10_V1 as object,
      judgePromptVersion: JUDGE_PROMPT_VERSION,
      isActive: true,
    },
    create: {
      version: RUBRIC_2020_07_10_V1.version,
      definition: RUBRIC_2020_07_10_V1 as object,
      judgePromptVersion: JUDGE_PROMPT_VERSION,
      isActive: true,
    },
  });

  // 役割定義
  for (const spec of ROLE_SPECS) {
    await prisma.roleSpecRecord.upsert({
      where: { role: spec.role },
      update: {
        side: spec.side,
        speechType: spec.speechType,
        labelJa: spec.labelJa,
        timeLimits: spec.timeLimits as object,
        requiredElements: spec.requiredElements as unknown as object,
        inputs: spec.inputs as unknown as object,
        isEnabled: spec.enabled,
      },
      create: {
        role: spec.role,
        side: spec.side,
        speechType: spec.speechType,
        labelJa: spec.labelJa,
        timeLimits: spec.timeLimits as object,
        requiredElements: spec.requiredElements as unknown as object,
        inputs: spec.inputs as unknown as object,
        isEnabled: spec.enabled,
      },
    });
  }

  // システム設定（既定値）
  const defaults: Record<string, unknown> = {
    "recording.retention": "delete", // "delete" | "keep"
    "pd_level.grid": DEFAULT_PD_LEVEL_GRID,
    "report.show_cefr": true,
    "daily_attempt_limit": 5,
    "judge.model": process.env.CLAUDE_MODEL ?? "claude-sonnet-5",
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as object },
    });
  }

  // 管理者アカウント（初期パスワードは必ず変更すること）
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "change-me-admin";
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "PDA 管理者",
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "admin",
    },
  });

  // 論題
  const count = await prisma.motion.count();
  if (count === 0) {
    await prisma.motion.createMany({
      data: INITIAL_MOTIONS.map((m) => ({
        textEn: m.textEn,
        category: m.category,
        difficulty: m.difficulty,
        targetRoles: ["PM", "LO"],
        isActive: true,
      })),
    });
  }

  console.log("Seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
