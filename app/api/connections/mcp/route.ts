import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { mcpConnectionSchema } from "@/lib/mcp";
import {
  requireUser,
  requireAdmin,
  readBody,
  errorResponse,
  AppError,
} from "@/lib/server/http";
import { openMCP, openStoredMCP, validateMCPUrl } from "@/lib/server/mcp";
import { seal } from "@/lib/server/secrets";
export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const connection = await openStoredMCP(
        u.organizationId,
        z.string().uuid().parse(id),
      );
      try {
        const result = await connection.client.listTools({
          options: { timeout: 20000 },
        });
        return Response.json(
          { tools: result.tools, nextCursor: result.nextCursor },
          { headers: { "Cache-Control": "no-store" } },
        );
      } finally {
        await connection.close();
      }
    }
    const rows = await getDb()
      .select()
      .from(records)
      .where(
        and(
          eq(records.organizationId, u.organizationId),
          eq(records.kind, "mcp-connection"),
        ),
      );
    return Response.json(
      {
        items: rows.map((r) => ({
          ...mcpConnectionSchema.parse(r.data),
          hasToken: !!(r.data as { ciphertext?: string }).ciphertext,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    requireAdmin(u);
    const body = z
      .object({
        action: z.enum(["save", "delete"]).default("save"),
        connection: mcpConnectionSchema,
        token: z.string().trim().max(4000).optional(),
      })
      .safeParse(await readBody(req, 8000));
    if (!body.success)
      throw new AppError(400, "Enter a name and valid MCP endpoint.");
    const { connection, action, token } = body.data;
    const where = and(
      eq(records.organizationId, u.organizationId),
      eq(records.id, connection.id),
      eq(records.kind, "mcp-connection"),
    );
    if (action === "delete") {
      await getDb().delete(records).where(where);
      return Response.json({ ok: true });
    }
    validateMCPUrl(connection.url);
    const [existing] = await getDb()
      .select()
      .from(records)
      .where(
        and(
          eq(records.organizationId, u.organizationId),
          eq(records.id, connection.id),
        ),
      )
      .limit(1);
    if (existing && existing.kind !== "mcp-connection")
      throw new AppError(409, "Choose another connection identifier.");
    const previous = existing?.data as
      { ciphertext?: string; url?: string } | undefined;
    if (
      previous?.url !== connection.url &&
      token === undefined &&
      previous?.ciphertext
    )
      throw new AppError(
        400,
        "Re-enter the token when changing the server address.",
      );
    // Validate the handshake and tool discovery before persisting a new connection.
    if (!existing || token !== undefined || previous?.url !== connection.url) {
      const check = await openMCP(connection.url, token);
      try {
        await check.client.listTools({ options: { timeout: 20000 } });
      } finally {
        await check.close();
      }
    }
    const ciphertext =
      token === undefined
        ? previous?.ciphertext
        : token
          ? await seal(token, u.organizationId, `mcp:${connection.id}`)
          : undefined;
    await getDb()
      .insert(records)
      .values({
        id: connection.id,
        organizationId: u.organizationId,
        createdBy: u.userId,
        kind: "mcp-connection",
        data: { ...connection, ...(ciphertext ? { ciphertext } : {}) },
      })
      .onConflictDoUpdate({
        target: [records.organizationId, records.id],
        set: {
          data: { ...connection, ...(ciphertext ? { ciphertext } : {}) },
          updatedAt: new Date(),
        },
      });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
