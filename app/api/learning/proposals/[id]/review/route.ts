import { errorResponse, readBody, requireUser } from "@/lib/server/http";
import { reviewLearningProposal } from "@/lib/server/learning";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) { try { const { id } = await params; return Response.json({ proposal: await reviewLearningProposal(await requireUser(req), id, await readBody(req, 4000)) }); } catch (e) { return errorResponse(e); } }
