import { z } from "zod";
import { AppError, errorResponse, readBody, requireUser } from "@/lib/server/http";
import { listRunFeedback, readRunFeedback, saveRunFeedback } from "@/lib/server/learning";
export async function GET(req: Request) {
  try { const u = await requireUser(), runId = new URL(req.url).searchParams.get("runId"); if (!runId) return Response.json({ items: await listRunFeedback(u) }, { headers: { "Cache-Control": "no-store" } }); if (!z.string().uuid().safeParse(runId).success) throw new AppError(400, "Choose a finished run."); return Response.json({ feedback: await readRunFeedback(u, runId) }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try { return Response.json({ feedback: await saveRunFeedback(await requireUser(req), await readBody(req, 7000)) }); } catch (e) { return errorResponse(e); }
}
