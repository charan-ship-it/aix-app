import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";
import {
  Agent,
  fetch as request,
  type RequestInit as UndiciRequestInit,
} from "undici";
import { createMCPClient } from "@ai-sdk/mcp";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { mcpConnectionSchema } from "@/lib/mcp";
import { unseal } from "./secrets";
import { AppError } from "./http";
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
export function validateMCPUrl(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    u.search ||
    (u.port && u.port !== "443")
  )
    throw new AppError(
      400,
      "Use a public HTTPS MCP endpoint without embedded credentials or query parameters. Put its bearer token in the secure token field.",
    );
  return u;
}
export async function openMCP(url: string, token?: string) {
  const target = validateMCPUrl(url);
  const addresses = await lookup(target.hostname, { all: true, family: 4 });
  if (
    !addresses.length ||
    addresses.some((a) => blocked.check(a.address, "ipv4"))
  )
    throw new AppError(
      400,
      "MCP connections must use a public server address.",
    );
  // Pin DNS for the connection, preventing a hostname from resolving to the private network after validation.
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        const found = addresses[0];
        if (options.all) callback(null, [found]);
        else callback(null, found.address, 4);
      },
    },
  });
  try {
    const client = await createMCPClient({
      clientName: "aixccelerate",
      transport: {
        type: "http",
        url: target.toString(),
        redirect: "error",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        fetch: async (input, init) => {
          const destination = new URL(
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url,
          );
          if (destination.origin !== target.origin)
            throw new AppError(
              400,
              "MCP requests cannot leave the configured server.",
            );
          return (await request(destination, {
            ...init,
            dispatcher,
            redirect: "error",
            signal: init?.signal
              ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)])
              : AbortSignal.timeout(30000),
          } as unknown as UndiciRequestInit)) as unknown as Response;
        },
      },
    });
    return {
      client,
      close: async () => {
        try {
          await client.close();
        } finally {
          await dispatcher.close();
        }
      },
    };
  } catch (e) {
    await dispatcher.close();
    throw e;
  }
}
export async function openStoredMCP(organizationId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(records)
    .where(
      and(
        eq(records.organizationId, organizationId),
        eq(records.id, id),
        eq(records.kind, "mcp-connection"),
      ),
    )
    .limit(1);
  if (!row) throw new AppError(404, "MCP connection not found.");
  const config = mcpConnectionSchema.parse(row.data);
  if (!config.enabled)
    throw new AppError(409, "This MCP connection is disabled.");
  const ciphertext = (row.data as { ciphertext?: string }).ciphertext;
  return openMCP(
    config.url,
    ciphertext
      ? await unseal(ciphertext, organizationId, `mcp:${id}`)
      : undefined,
  );
}
