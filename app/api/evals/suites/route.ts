import { createSuite, listSuites } from "@/lib/server/evals";
import { errorResponse, readBody, requireUser } from "@/lib/server/http";
export async function GET(req: Request) {
  try {
    return Response.json(
      {
        items: await listSuites(
          await requireUser(),
          new URL(req.url).searchParams.get("skillId") || undefined,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    return Response.json({
      suite: await createSuite(
        await requireUser(req),
        await readBody(req, 80000),
      ),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
