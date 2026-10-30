import { requireUser, errorResponse } from "@/lib/server/http";
import { cancelRun } from "@/lib/server/runtime";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(req);
    return Response.json(await cancelRun(user, (await params).id));
  } catch (e) {
    return errorResponse(e);
  }
}
