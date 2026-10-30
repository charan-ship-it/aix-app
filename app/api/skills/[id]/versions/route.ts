import { listSkillVersions } from "@/lib/server/skills";
import { requireUser, errorResponse } from "@/lib/server/http";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const u = await requireUser(), { id } = await params; return Response.json({ items: await listSkillVersions(u.organizationId, id) }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return errorResponse(e); }
}
