import { composioAuthConfigsFor } from "@/lib/server/composio-config";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { toolkitSlugs } from "@/lib/agent-config";
import type { IntegrationTestResult } from "@/lib/integration-tests";
import { composioFor, composioUser } from "@/lib/server/composio";
import {
  AppError,
  requireUser,
  readBody,
  errorResponse,
} from "@/lib/server/http";
import { rateLimit } from "@/lib/server/redis";
export async function GET() {
  try {
    const u = await requireUser();
    const rows = await getDb()
      .select({ data: records.data })
      .from(records)
      .where(
        and(
          eq(records.organizationId, u.organizationId),
          eq(records.createdBy, u.userId),
          eq(records.kind, "integration-test"),
        ),
      )
      .orderBy(desc(records.updatedAt))
      .limit(30);
    return Response.json(
      { items: rows.map((r) => r.data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const b = z
      .object({
        id: z.string().uuid(),
        toolkit: z
          .string()
          .refine((t) =>
            toolkitSlugs.includes(t as (typeof toolkitSlugs)[number]),
          ),
        tool: z
          .string()
          .regex(/^[A-Z0-9_]+$/)
          .max(200),
        arguments: z.record(z.string(), z.unknown()),
        confirmed: z.literal(true),
      })
      .safeParse(await readBody(req, 20000));
    if (!b.success)
      throw new AppError(
        400,
        "Choose a tool, enter valid inputs, and confirm the test.",
      );
    if (
      !(await rateLimit(`integration-test:${u.organizationId}:${u.userId}`, 10))
    )
      throw new AppError(
        429,
        "Wait a moment before running another integration test.",
      );
    const { id, toolkit, tool, arguments: args } = b.data;
    const c = await composioFor(u.organizationId);
    const definitions = await c.tools.getRawComposioTools(
      { tools: [tool] },
      undefined,
      { signal: AbortSignal.timeout(20000) },
    );
    const definition = definitions.find((t) => t.slug === tool);
    if (
      !definition ||
      definition.toolkit?.slug !== toolkit ||
      !definition.tags?.includes("readOnlyHint") ||
      definition.isDeprecated
    )
      throw new AppError(
        403,
        "Only current read-only tools from this app can be checked here. Test external actions in an agent conversation with approval.",
      );
    const result: IntegrationTestResult = {
      id,
      toolkit,
      tool,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    const inserted = await getDb()
      .insert(records)
      .values({
        organizationId: u.organizationId,
        createdBy: u.userId,
        id,
        kind: "integration-test",
        data: { ...result },
      })
      .onConflictDoNothing()
      .returning({ id: records.id });
    if (!inserted.length)
      throw new AppError(
        409,
        "This test was already submitted. Refresh its result before starting another.",
      );
    let session: Awaited<ReturnType<typeof c.create>> | undefined;
    try {
      session = await c.create(composioUser(u.organizationId, u.userId), {
        toolkits: [toolkit],
        authConfigs: composioAuthConfigsFor([toolkit]),
        tools: { [toolkit]: { enable: [tool] } },
        tags: ["readOnlyHint"],
        manageConnections: false,
        sandbox: { enable: false },
        proxyExecute: { enable: false },
        instant: false,
      });
      const connections = await session.toolkits();
      if (
        !connections.items.find((t) => t.slug === toolkit)?.connection?.isActive
      )
        throw new AppError(
          428,
          "Connect your app account before running this check.",
        );
      const response = await session.execute(tool, args);
      result.status = response.resultType === "completed" ? "passed" : "failed";
      result.output = response.data;
      if (result.status === "failed")
        result.error =
          "The app did not complete this tool call. Review the response and app permissions.";
    } catch (e) {
      result.status = "failed";
      result.error =
        e instanceof AppError
          ? e.message
          : "The live integration call failed or timed out. Check your connection and tool inputs before retrying.";
    } finally {
      result.finishedAt = new Date().toISOString();
      // Test output is personal account data; retain only in this member's scoped history.
      const output = JSON.stringify(result.output ?? null);
      if (output.length > 100000)
        result.output = { truncated: true, preview: output.slice(0, 100000) };
      await getDb()
        .update(records)
        .set({ data: { ...result }, updatedAt: new Date() })
        .where(
          and(
            eq(records.organizationId, u.organizationId),
            eq(records.createdBy, u.userId),
            eq(records.id, id),
            eq(records.kind, "integration-test"),
          ),
        );
      await session?.delete().catch(() => {});
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
