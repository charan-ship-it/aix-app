import { readEvaluations } from "@/lib/server/evals";
import { AppError, errorResponse, requireUser } from "@/lib/server/http";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const [run] = await readEvaluations(await requireUser(), { id });
    if (!run) throw new AppError(404, "Evaluation not found.");
    return Response.json({ run }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
