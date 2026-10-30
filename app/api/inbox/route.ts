import { z } from "zod";
import {
  requireUser,
  readBody,
  errorResponse,
  AppError,
} from "@/lib/server/http";
import { readWorkInbox, reviewWork } from "@/lib/server/work-inbox";
export async function GET() {
  try {
    return Response.json(await readWorkInbox(await requireUser()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const b = z
      .object({ id: z.string().uuid(), updatedAt: z.string().datetime() })
      .safeParse(await readBody(req, 1000));
    if (!b.success) throw new AppError(400, "Choose a current work item.");
    await reviewWork(u, b.data.id, b.data.updatedAt);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
