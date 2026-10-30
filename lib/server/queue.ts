import { createHash } from "node:crypto";
import { Queue } from "bullmq";
let indexing: Queue | undefined,
  agents: Queue | undefined,
  scheduler: Queue | undefined;
export function redisConnection() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
  const u = new URL(process.env.REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: Number(u.pathname.slice(1) || 0),
    ...(u.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
function producerConnection() {
  return {
    ...redisConnection(),
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
  };
}
export function indexingQueue() {
  return (indexing ??= new Queue("knowledge-index", {
    connection: producerConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  }));
}
export function agentQueue() {
  return (agents ??= new Queue("agent-run", {
    connection: producerConnection(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  }));
}
export function scheduleQueue() {
  return (scheduler ??= new Queue("agent-schedule", {
    connection: producerConnection(),
  }));
}

export function documentJobId(
  organizationId: string,
  documentId: string,
  content: string,
  updatedAt: string,
) {
  return (
    "index-" +
    createHash("sha256")
      .update(JSON.stringify([organizationId, documentId, content, updatedAt]))
      .digest("hex")
  );
}
