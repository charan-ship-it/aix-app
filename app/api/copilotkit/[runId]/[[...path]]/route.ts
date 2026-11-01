import { createAIXCopilotHandler } from "@/lib/server/copilotkit-observer";
import { readWorkDetail } from "@/lib/server/work-detail";
import { AppError, errorResponse, requireUser } from "@/lib/server/http";
import { readBody } from "@/lib/server/http";
import { prepareAGUIObserver } from "@/lib/server/ag-ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ runId: string; path?: string[] }> };

async function handle(req: Request, context: Context) {
  try {
    const user = await requireUser(req);
    const { runId, path = [] } = await context.params;
    const work = await readWorkDetail(user, runId);
    const route = path.join("/");
    const allowed = req.method === "GET" && (route === "info" || route === "agent/aix-observer/capabilities")
      || req.method === "POST" && route === "agent/aix-observer/run";
    if (!allowed) throw new AppError(405, "This endpoint only observes existing work.");
    let request = req;
    if (req.method === "POST") {
      // Reject authority-bearing input before the runtime can apply any middleware.
      // The iterator is not started here; only schema/scope validation and sanitization run.
      const observation = await prepareAGUIObserver(user, runId, await readBody(req, 200000), { signal: req.signal });
      const headers = new Headers(req.headers);
      headers.delete("content-length");
      request = new Request(req.url, { method: "POST", headers, body: JSON.stringify(observation.input), signal: req.signal });
    }
    const response = await createAIXCopilotHandler(user, runId, work.conversation.id, req.signal)(request);
    response.headers.set("Cache-Control", "no-store, no-transform");
    response.headers.set("X-Accel-Buffering", "no");
    return response;
  } catch (error) { return errorResponse(error); }
}
export const GET = handle;
export const POST = handle;
