import { requireUser, errorResponse } from "@/lib/server/http";
import { openRunEventStream } from "@/lib/server/run-event-stream";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const stream = await openRunEventStream(user, (await params).id, {
      signal: req.signal, after: new URL(req.url).searchParams.get("after") || undefined,
    });
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
    } });
  } catch (error) { return errorResponse(error); }
}
