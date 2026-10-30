import { errorResponse, requireUser } from "@/lib/server/http";
import { readWorkDetail } from "@/lib/server/work-detail";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await readWorkDetail(user, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
