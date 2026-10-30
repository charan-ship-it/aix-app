import { z } from "zod";
import {
  requireUser,
  readBody,
  errorResponse,
  AppError,
} from "@/lib/server/http";
import { enqueueRun } from "@/lib/server/runtime";
import { rateLimit } from "@/lib/server/redis";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    if (!(await rateLimit(u.organizationId + ":" + u.userId + ":runs", 20, 60)))
      throw new AppError(429, "Too many runs. Wait a minute and try again.");
    const body = z
      .object({
        agentId: z.string().max(100),
        message: z.string().trim().min(1).max(20000),
        podId: z.string().uuid().optional(),
        chatId: z.string().uuid().optional(),
      })
      .safeParse(await readBody(req, 25000));
    if (!body.success)
      throw new AppError(400, "Enter a message and select an agent.");
    return Response.json(
      await enqueueRun(
        u,
        body.data.agentId,
        body.data.message,
        body.data.chatId,
        body.data.podId,
      ),
      { status: 202 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
