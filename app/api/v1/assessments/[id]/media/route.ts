import { prisma } from "@/src/lib/db";
import { requireUser, ApiError } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";
import { getOwnedAssessment } from "@/src/services/assessmentService";
import { makeStorage } from "@/src/adapters/providers";
import { getRetention } from "@/src/lib/settings";

const MAX_BYTES = 200 * 1024 * 1024; // 200MB
const ALLOWED_MIME = ["video/webm", "video/mp4"];

/** 録画のアップロード（録画終了後にクライアントがPOSTする） */
export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const a = await getOwnedAssessment(user.id, id);
    if (a.status !== "recording") {
      throw new ApiError(409, "invalid_state", "録画中のアセスメントではありません");
    }

    const mimeType = (req.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!ALLOWED_MIME.includes(mimeType)) {
      throw new ApiError(415, "unsupported_media", "webm または mp4 のみアップロードできます");
    }

    const body = Buffer.from(await req.arrayBuffer());
    if (body.length === 0) throw new ApiError(400, "empty_body", "録画データが空です");
    if (body.length > MAX_BYTES) {
      throw new ApiError(413, "too_large", "録画データが大きすぎます（上限200MB）");
    }

    // 二重投稿防止: 既存のvideoがあれば拒否
    const existing = await prisma.mediaFile.findFirst({
      where: { assessmentId: id, kind: "video", deletedAt: null },
    });
    if (existing) throw new ApiError(409, "already_uploaded", "録画は既にアップロード済みです");

    const ext = mimeType === "video/mp4" ? "mp4" : "webm";
    const key = `media/${id}/recording.${ext}`;
    await makeStorage().put(key, body, mimeType);

    const retention = await getRetention();
    const media = await prisma.mediaFile.create({
      data: {
        assessmentId: id,
        kind: "video",
        storageKey: key,
        mimeType,
        sizeBytes: BigInt(body.length),
        retention: retention === "keep" ? "keep" : "delete_after_scoring",
      },
    });
    await prisma.assessment.update({
      where: { id },
      data: { status: "uploaded", recordingEndedAt: new Date() },
    });
    return ok({ mediaFileId: media.id });
  },
);
