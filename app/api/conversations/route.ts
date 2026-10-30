import { requireUser, errorResponse } from "@/lib/server/http";
import { listConversationIndex } from "@/lib/server/conversation-index";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const query = Object.fromEntries(new URL(req.url).searchParams);
    return Response.json(await listConversationIndex(user, query), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
