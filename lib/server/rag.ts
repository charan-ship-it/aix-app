import { and, eq, sql, inArray } from "drizzle-orm";
import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getDb } from "@/db";
import { chunks, records } from "@/db/schema";
import { secret } from "./secrets";
import type { AgentConfig } from "@/lib/agent-config";
import type { Document } from "@/lib/workspace";
export function splitText(text: string, size = 1600, overlap = 240) {
  if (size <= overlap) throw new Error("Chunk size must exceed overlap");
  const result: string[] = [];
  for (let start = 0; start < text.length; start += size - overlap) {
    const part = text.slice(start, start + size).trim();
    if (part) result.push(part);
    if (start + size >= text.length) break;
  }
  return result;
}
export async function indexDocument(
  organizationId: string,
  documentId: string,
) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(records)
    .where(
      and(
        eq(records.organizationId, organizationId),
        eq(records.id, documentId),
        eq(records.kind, "document"),
      ),
    )
    .limit(1);
  if (!row) return;
  const doc = row.data as Document;
  const content = splitText(doc.content);
  const key = await secret(organizationId, "openai");
  let vectors: number[][] = [];
  if (key && content.length) {
    const provider = createOpenAI({
      apiKey: key,
      baseURL: process.env.OPENAI_BASE_URL,
    });
    const r = await embedMany({
      model: provider.embedding("text-embedding-3-small"),
      values: content,
      maxRetries: 1,
    });
    vectors = r.embeddings;
  }
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(records)
      .where(
        and(
          eq(records.organizationId, organizationId),
          eq(records.id, documentId),
          eq(records.kind, "document"),
        ),
      )
      .for("update")
      .limit(1);
    if (!current || (current.data as Document).content !== doc.content) return;
    await tx
      .delete(chunks)
      .where(
        and(
          eq(chunks.organizationId, organizationId),
          eq(chunks.documentId, documentId),
        ),
      );
    if (content.length)
      await tx.insert(chunks).values(
        content.map((part, i) => ({
          id: crypto.randomUUID(),
          organizationId,
          documentId,
          ordinal: i,
          content: part,
          embedding: vectors[i] || null,
        })),
      );
    await tx
      .update(records)
      .set({
        data: {
          ...doc,
          status: "ready",
          indexMode: key ? "hybrid" : "keyword",
          chunkCount: content.length,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(records.organizationId, organizationId),
          eq(records.id, documentId),
          eq(records.kind, "document"),
        ),
      );
  });
}
export async function searchKnowledge(
  organizationId: string,
  query: string,
  agent: AgentConfig,
) {
  if (agent.knowledgeScope === "none") return [];
  if (agent.knowledgeScope === "selected" && !agent.documentIds.length)
    return [];
  const db = getDb();
  const filter = and(
    eq(chunks.organizationId, organizationId),
    agent.knowledgeScope === "selected"
      ? inArray(chunks.documentId, agent.documentIds)
      : sql`(${chunks.documentId} IN (SELECT id FROM workspace_record WHERE organization_id = ${organizationId} AND kind = 'document' AND data->>'podId' IS NULL) OR ${agent.documentIds.length ? inArray(chunks.documentId, agent.documentIds) : sql`false`})`,
  );
  const key = await secret(organizationId, "openai");
  let vector: number[] | undefined;
  if (key) {
    try {
      const result = await embed({
        model: createOpenAI({
          apiKey: key,
          baseURL: process.env.OPENAI_BASE_URL,
        }).embedding("text-embedding-3-small"),
        value: query,
        maxRetries: 1,
      });
      vector = result.embedding;
    } catch {}
  }
  const score = vector
    ? sql<number>`(coalesce(1 - (${chunks.embedding} <=> ${JSON.stringify(vector)}::vector),0) * 0.7 + ts_rank_cd(to_tsvector('english',${chunks.content}),websearch_to_tsquery('english',${query})) * 0.3)`
    : sql<number>`ts_rank_cd(to_tsvector('english',${chunks.content}),websearch_to_tsquery('english',${query}))`;
  const rows = await db
    .select({ documentId: chunks.documentId, content: chunks.content, score })
    .from(chunks)
    .where(filter)
    .orderBy(sql`${score} desc`)
    .limit(6);
  const ids = [...new Set(rows.map((r) => r.documentId))];
  if (!ids.length) return [];
  const docs = await db
    .select({ id: records.id, data: records.data })
    .from(records)
    .where(
      and(
        eq(records.organizationId, organizationId),
        eq(records.kind, "document"),
        inArray(records.id, ids),
      ),
    );
  return rows
    .filter(
      (r) =>
        docs.some((d) => d.id === r.documentId) &&
        Number(r.score) > (vector?.length ? 0.12 : 0),
    )
    .map((r) => ({
      documentId: r.documentId,
      name:
        (docs.find((d) => d.id === r.documentId)?.data as Document | undefined)
          ?.name || "Document",
      content: r.content,
    }));
}
