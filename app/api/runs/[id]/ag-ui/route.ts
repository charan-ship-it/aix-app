import { openAGUIRunEventStream } from "@/lib/server/ag-ui";
import { errorResponse, readBody, requireUser } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const stream = await openAGUIRunEventStream(user, (await params).id, await readBody(req, 1000000), { signal: req.signal });
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no",
    } });
  } catch (error) { return errorResponse(error); }
}
