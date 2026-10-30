import { errorResponse, readBody, requireUser } from "@/lib/server/http";
import { listLearningProposals, proposeLearningImprovement } from "@/lib/server/learning";
export async function GET() { try { return Response.json({ items: await listLearningProposals(await requireUser()) }, { headers: { "Cache-Control": "no-store" } }); } catch (e) { return errorResponse(e); } }
export async function POST(req: Request) { try { return Response.json({ proposal: await proposeLearningImprovement(await requireUser(req), await readBody(req, 24000)) }); } catch (e) { return errorResponse(e); } }
