import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";
import { getPersonalTimezone, setPersonalTimezone } from "@/lib/server/personal-timezone";
import { AppError, errorResponse, readBody, requireUser } from "@/lib/server/http";
export async function GET() { try { const u = await requireUser(); return Response.json({timezone:await getPersonalTimezone(u)}, {headers:{"Cache-Control":"no-store"}}); } catch(e) { return errorResponse(e); } }
export async function PUT(req: Request) { try { const u = await requireUser(req); const parsed = z.object({timezone:z.string().refine(isValidTimeZone)}).strict().safeParse(await readBody(req,1000)); if (!parsed.success) throw new AppError(400,"Choose a valid timezone."); await setPersonalTimezone(u,parsed.data.timezone); return Response.json({timezone:parsed.data.timezone}); } catch(e) { return errorResponse(e); } }
