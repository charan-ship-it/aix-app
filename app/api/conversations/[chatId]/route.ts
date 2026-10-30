import { readConversation } from "@/lib/server/conversations";
import { requireUser, errorResponse } from "@/lib/server/http";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    return Response.json(
      await readConversation(await requireUser(), (await params).chatId),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
