import type { AssessmentStatus, DebateRole } from "@prisma/client";
import { prisma } from "../lib/db";
import { ApiError } from "../lib/session";
import { getRetention, getSetting } from "../lib/settings";

/** 状態遷移の検証（サーバー側で厳密に管理） */
const TRANSITIONS: Record<string, AssessmentStatus[]> = {
  created: ["preparing", "abandoned"],
  preparing: ["listening", "recording", "abandoned"],
  listening: ["recording", "abandoned"],
  recording: ["uploaded", "abandoned"],
  uploaded: ["processing", "abandoned"],
  processing: ["scored", "failed"],
  failed: ["processing"], // 再採点
};

export function assertTransition(from: AssessmentStatus, to: AssessmentStatus): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new ApiError(409, "invalid_state", `現在の状態（${from}）からは実行できない操作です`);
  }
}

export async function createAssessment(userId: string, role: DebateRole) {
  const spec = await prisma.roleSpecRecord.findUnique({ where: { role } });
  if (!spec || !spec.isEnabled) {
    throw new ApiError(400, "role_disabled", "この役割のアセスメントは現在受験できません");
  }

  // 1日あたりの受験回数上限
  const limit = await getSetting<number>("daily_attempt_limit");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const count = await prisma.assessment.count({
    where: { userId, createdAt: { gte: today }, status: { not: "abandoned" } },
  });
  if (count >= limit) {
    throw new ApiError(429, "daily_limit", `1日の受験回数上限（${limit}回）に達しました。明日また挑戦してください`);
  }

  // 進行中のアセスメントがあれば中断扱いにする（二重受験防止）
  await prisma.assessment.updateMany({
    where: {
      userId,
      status: { in: ["created", "preparing", "listening", "recording", "uploaded"] },
    },
    data: { status: "abandoned" },
  });

  // 論題をランダム抽選
  const motions = await prisma.motion.findMany({
    where: { isActive: true, targetRoles: { has: role } },
    select: { id: true },
  });
  if (motions.length === 0) {
    throw new ApiError(503, "no_motions", "出題可能な論題がありません。管理者にお問い合わせください");
  }
  const motionId = motions[Math.floor(Math.random() * motions.length)]!.id;

  const retention = await getRetention();
  return prisma.assessment.create({
    data: {
      userId,
      role,
      motionId,
      language: "en",
      status: "created",
      settingsSnapshot: { retention },
    },
    include: { motion: true },
  });
}

export async function getOwnedAssessment(userId: string, assessmentId: string) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: { motion: true },
  });
  if (!assessment || assessment.userId !== userId) {
    throw new ApiError(404, "not_found", "アセスメントが見つかりません");
  }
  return assessment;
}
