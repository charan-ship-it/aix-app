import { archiveSkill, listSkills, saveSkill } from "@/lib/server/skills";
import { AppError, errorResponse, readBody, requireUser } from "@/lib/server/http";
export async function GET(req: Request) {
  try { const u = await requireUser(); return Response.json({ items: await listSkills(u.organizationId, new URL(req.url).searchParams.get("archived") === "1") }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(req), body = await readBody(req, 20000);
    if (!body || typeof body !== "object") throw new AppError(400, "Choose a skill action.");
    if (body.action === "save") return Response.json({ skill: await saveSkill(u, body.skill) });
    if (body.action === "archive") return Response.json({ skill: await archiveSkill(u, body) });
    throw new AppError(400, "Choose a skill action.");
  } catch (e) { return errorResponse(e); }
}
