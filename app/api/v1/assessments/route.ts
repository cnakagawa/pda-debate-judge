import { z } from "zod";
import { prisma } from "@/src/lib/db";
import { requireUser } from "@/src/lib/session";
import { handler, ok, parseBody } from "@/src/lib/api";
import { createAssessment } from "@/src/services/assessmentService";

const createSchema = z.object({
  role: z.enum(["PM", "LO", "MG", "MO", "LOR", "PMR"]),
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseBody(req, createSchema);
  const assessment = await createAssessment(user.id, body.role);
  const spec = await prisma.roleSpecRecord.findUniqueOrThrow({ where: { role: body.role } });
  return ok({
    id: assessment.id,
    role: assessment.role,
    motion: assessment.motion.textEn,
    language: assessment.language,
    status: assessment.status,
    requiredElements: spec.requiredElements,
    needsPmSpeech: assessment.role === "LO",
  });
});

export const GET = handler(async () => {
  const user = await requireUser();
  const assessments = await prisma.assessment.findMany({
    where: { userId: user.id, status: { in: ["scored", "failed", "processing"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      motion: true,
      evaluations: { where: { isCurrent: true } },
    },
  });
  return ok(
    assessments.map((a) => ({
      id: a.id,
      role: a.role,
      motion: a.motion.textEn,
      status: a.status,
      testDate: (a.completedAt ?? a.createdAt).toISOString().slice(0, 10),
      totalScore: a.evaluations[0]?.totalScore ?? null,
      matterScore: a.evaluations[0]?.matterScore ?? null,
      mannerScore: a.evaluations[0]?.mannerScore ?? null,
      pdLevel: a.evaluations[0]?.pdLevel ?? null,
    })),
  );
});
