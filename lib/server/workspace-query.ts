import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { getPod } from "./pods";
import { findAgent } from "./runtime";
import { builtinEmployees } from "@/lib/employee-models";
import { connectionSettings } from "./secrets";
import { AppError, type WorkspaceUser } from "./http";
import type { ProductData } from "@/lib/product-client";
export async function readWorkspace(
  u: WorkspaceUser,
  options: { podId?: string; agentId?: string; includeArchived?: boolean } = {},
) {
  const rows = await getDb()
    .select()
    .from(records)
    .where(
      and(
        eq(records.organizationId, u.organizationId),
        or(
          eq(records.kind, "agent"),
          eq(records.kind, "document"),
          and(eq(records.kind, "chat"), eq(records.createdBy, u.userId)),
        ),
      ),
    );
  const includeArchived = options.includeArchived === true;
  const podId = options.podId;
  const pod = podId ? await getPod(u, podId) : null;
  const selectedId = options.agentId;
  const employee = pod
    ? await findAgent(u.organizationId, pod.defaultAgentId).catch((error) => {
        if (error instanceof AppError && error.status === 404) return null;
        throw error;
      })
    : selectedId
      ? await findAgent(u.organizationId, selectedId)
      : null;
  const visibleRows = employee
    ? rows.filter(
        (r) =>
          r.kind === "agent" ||
          (r.kind === "chat" &&
            (r.data as { agentId?: string }).agentId === selectedId) ||
          (r.kind === "document" &&
            (employee.knowledgeScope === "all" ||
              (r.data as { agentId?: string }).agentId === selectedId ||
              employee.documentIds.includes(r.id))),
      )
    : rows;
  const settings = await connectionSettings(u.organizationId);

  return {
    records: (pod
      ? rows.filter(
          (r) =>
            r.kind === "agent" ||
            (r.kind === "chat" &&
              (r.data as { podId?: string }).podId === podId) ||
            (r.kind === "document" &&
              (r.data as { podId?: string }).podId === podId),
        )
      : visibleRows.filter((r) => !(r.data as { podId?: string }).podId)
    )
      .filter(
        (r) =>
          includeArchived ||
          r.kind !== "agent" ||
          (r.data as { archived?: boolean }).archived !== true,
      )
      .map((r) => ({
        ...r.data,
        ...(r.kind === "agent"
          ? {
              archived: (r.data as { archived?: boolean }).archived === true,
            }
          : {}),
        kind: r.kind,
      })),
    employee,
    pod,
    providers: settings.providers,
    agents: builtinEmployees(settings.providers)
      .map((a) => ({
        ...a,
        ...(rows.find((r) => r.kind === "agent" && r.id === a.id)?.data || {}),
      }))
      .filter((a) => includeArchived || a.archived !== true),
    live: settings.providers.some(
      (p) => p.configured,
    ),
    user: u.displayName,
    organization: {
      id: u.organizationId,
      name: u.organizationName,
      role: u.role,
    },
  } as ProductData;
}
