import { readEvaluations, startEvaluation } from "@/lib/server/evals";
import { errorResponse, readBody, requireUser } from "@/lib/server/http";
export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    return Response.json(
      {
        items: await readEvaluations(await requireUser(), {
          skillId: p.get("skillId") || undefined,
          suiteId: p.get("suiteId") || undefined,
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    return Response.json(
      {
        run: await startEvaluation(
          await requireUser(req),
          await readBody(req, 10000),
        ),
      },
      { status: 202 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
