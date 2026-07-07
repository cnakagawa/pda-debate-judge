import { prisma } from "@/src/lib/db";
import { requireUser } from "@/src/lib/session";
import { handler } from "@/src/lib/api";
import { getOwnedAssessment } from "@/src/services/assessmentService";

export const dynamic = "force-dynamic";

/** 採点進捗のSSE配信（DBポーリング → クライアントへプッシュ） */
export const GET = handler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await getOwnedAssessment(user.id, id);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        try {
          for (let i = 0; i < 240; i++) {
            const a = await prisma.assessment.findUnique({
              where: { id },
              select: { status: true, statusDetail: true },
            });
            if (!a) break;
            send("progress", { status: a.status, detail: a.statusDetail });
            if (a.status === "scored" || a.status === "failed") break;
            await new Promise((r) => setTimeout(r, 1500));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  },
);
