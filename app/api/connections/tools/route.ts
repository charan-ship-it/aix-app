import { z } from "zod";
import { toolkitSlugs } from "@/lib/agent-config";
import { composioFor } from "@/lib/server/composio";
import { requireUser, errorResponse, AppError } from "@/lib/server/http";
export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const params = new URL(req.url).searchParams;
    const toolkit = params.get("toolkit") || "";
    if (!toolkitSlugs.includes(toolkit as (typeof toolkitSlugs)[number]))
      throw new AppError(400, "Choose a supported app.");
    const search = z
      .string()
      .max(200)
      .parse(params.get("search") || "");
    const c = await composioFor(u.organizationId);
    const items = await c.tools.getRawComposioTools(
      {
        toolkits: [toolkit],
        limit: 50,
        ...(search ? { search } : {}),
        ...(params.get("readOnly") === "1" ? { tags: ["readOnlyHint"] } : {}),
      },
      undefined,
      { signal: AbortSignal.timeout(20000) },
    );
    return Response.json(
      {
        items: items
          .filter((t) => !t.isDeprecated)
          .map((t) => ({
            slug: t.slug,
            name: t.name,
            description: t.description,
            inputParameters: t.inputParameters,
            tags: t.tags,
          })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
