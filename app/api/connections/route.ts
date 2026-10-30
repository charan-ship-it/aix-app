import { z } from "zod";
import { toolkitCatalog, toolkitSlugs } from "@/lib/agent-config";
import {
  requireUser,
  readBody,
  errorResponse,
  AppError,
} from "@/lib/server/http";
import { connectionSession } from "@/lib/server/composio";
import { composioPlatformConfig } from "@/lib/server/composio-config";
export async function GET() {
  try {
    const u = await requireUser();
    if (!composioPlatformConfig().apiKey)
      return Response.json({
        configured: false,
        items: toolkitCatalog.map((t) => ({ ...t, connected: false })),
      });
    const session = await connectionSession(u.organizationId, u.userId);
    try {
      const result = await session.toolkits();
      return Response.json(
        {
          configured: true,
          items: toolkitCatalog.map((t) => ({
            ...t,
            connected:
              result.items.find((i) => i.slug === t.slug)?.connection
                ?.isActive || false,
          })),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } finally {
      await session.delete().catch(() => {});
    }
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const body = z
      .object({
        toolkit: z
          .string()
          .refine((s) =>
            toolkitSlugs.includes(s as (typeof toolkitSlugs)[number]),
          ),
      })
      .safeParse(await readBody(req, 1000));
    if (!body.success) throw new AppError(400, "Choose a supported app.");
    const session = await connectionSession(u.organizationId, u.userId);
    const result = await session.authorize(body.data.toolkit, {
      callbackUrl: new URL(
        "/connections/callback",
        process.env.BETTER_AUTH_URL || req.url,
      ).toString(),
    });
    if (!result.redirectUrl)
      throw new AppError(503, "The connection link could not be created.");
    return Response.json({ url: result.redirectUrl });
  } catch (e) {
    return errorResponse(e);
  }
}
