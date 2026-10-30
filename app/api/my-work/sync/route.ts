import { requireUser, errorResponse, AppError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/redis";
import { syncScribe } from "@/lib/server/my-work";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    if (
      !(await rateLimit(
        "my-work-sync:" + user.organizationId + ":" + user.userId,
        4,
        60,
      ))
    )
      throw new AppError(429, "Please wait a minute before importing again.");
    return Response.json(await syncScribe(user), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
