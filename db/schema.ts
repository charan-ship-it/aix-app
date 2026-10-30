import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  uniqueIndex,
  index,
  vector,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AgentConfig } from "@/lib/agent-config";
import type { Chat, Document } from "@/lib/workspace";
const dates = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};
export const user = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...dates,
});
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: dates.createdAt,
});
export const session = pgTable("auth_session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  activeOrganizationId: text("active_organization_id"),
  ...dates,
});
export const account = pgTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  ...dates,
});
export const verification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...dates,
});
export const member = pgTable(
  "organization_member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: dates.createdAt,
  },
  (t) => [uniqueIndex("org_member_unique").on(t.organizationId, t.userId)],
);
export const invitation = pgTable("organization_invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  createdAt: dates.createdAt,
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
export const records = pgTable(
  "workspace_record",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    kind: text("kind").notNull(),
    data: jsonb("data")
      .$type<AgentConfig | Chat | Document | Record<string, unknown>>()
      .notNull(),
    ...dates,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.id] }),
    index("records_org_kind").on(t.organizationId, t.kind),
  ],
);
export const credentials = pgTable(
  "provider_credential",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    lastFour: text("last_four").notNull(),
    models: jsonb("models").$type<string[]>().notNull(),
    updatedAt: dates.updatedAt,
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.provider] })],
);
export const chunks = pgTable(
  "knowledge_chunk",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: text("document_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: dates.createdAt,
  },
  (t) => [
    index("chunks_org_document").on(t.organizationId, t.documentId),
    index("chunks_embedding_hnsw").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);
export const runs = pgTable(
  "agent_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    chatId: text("chat_id").notNull(),
    agentId: text("agent_id").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    ...dates,
  },
  (t) => [
    index("run_org_chat").on(t.organizationId, t.chatId),
    index("run_org_parent")
      .on(t.organizationId, sql`(${t.payload}->>'parentRunId')`)
      .where(sql`${t.payload}->>'parentRunId' IS NOT NULL`),
    uniqueIndex("run_one_active_chat")
      .on(t.organizationId, t.chatId)
      .where(sql`${t.status} IN ('queued', 'running', 'awaiting_approval')`),
  ],
);
export const auditEvents = pgTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    resourceId: text("resource_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: dates.createdAt,
  },
  (t) => [index("audit_org_time").on(t.organizationId, t.createdAt)],
);
export const schedules = pgTable("agent_schedule", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  agentId: text("agent_id").notNull(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  pattern: text("pattern").notNull(),
  timezone: text("timezone").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  ...dates,
});
