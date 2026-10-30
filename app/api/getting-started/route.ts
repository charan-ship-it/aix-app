import { errorResponse, readBody, requireUser } from "@/lib/server/http";
import { readGettingStarted, saveGettingStartedPreference } from "@/lib/server/getting-started";

const noStore = { "Cache-Control": "no-store" };
export async function GET() {
  try { return Response.json(await readGettingStarted(await requireUser()), { headers: noStore }); }
  catch (error) { return errorResponse(error); }
}
export async function PATCH(req: Request) {
  try {
    const u = await requireUser(req);
    const preference = await saveGettingStartedPreference(u, await readBody(req, 1000));
    return Response.json({ preference }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
