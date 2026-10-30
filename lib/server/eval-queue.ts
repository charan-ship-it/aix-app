import { Queue } from "bullmq";
import { redisConnection } from "./queue";
let queue: Queue | undefined;
export const EVALUATION_QUEUE = "skill-evaluation";
export function evalQueue() {
  return (queue ??= new Queue(EVALUATION_QUEUE, {
    connection: {
      ...redisConnection(),
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
    },
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  }));
}
export function evaluationJobId(organizationId: string, id: string) {
  return `evaluation-${encodeURIComponent(organizationId)}-${id}`;
}
