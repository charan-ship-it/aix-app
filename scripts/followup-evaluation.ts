/** Create a synthetic evaluation for an existing follow-up agent in the owner’s workspace.
 * Run: npx tsx scripts/followup-evaluation.ts <conversation-id> <agent-id> [existing-suite-id] */
import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "../db";
import { records, member, user, organization } from "../db/schema";
import { saveSkill } from "../lib/server/skills";
import { createSuite, listSuites, startEvaluation } from "../lib/server/evals";
import { findAgent } from "../lib/server/runtime";
import { getRedis } from "../lib/server/redis";
import { evalQueue } from "../lib/server/eval-queue";
try { process.loadEnvFile(); } catch {}
const [chatId, agentId, existingSuiteId] = process.argv.slice(2);
if (!chatId || !agentId) throw new Error("Supply a conversation ID and agent ID.");
const db = getDb();
const [actor] = await db.select({userId:user.id,displayName:user.name,email:user.email,organizationId:organization.id,organizationName:organization.name,role:member.role}).from(records).innerJoin(user,eq(user.id,records.createdBy)).innerJoin(organization,eq(organization.id,records.organizationId)).innerJoin(member,and(eq(member.organizationId,organization.id),eq(member.userId,user.id))).where(and(eq(records.id,chatId),eq(records.kind,"chat"))).limit(1);
if (!actor || !["owner","admin"].includes(actor.role)) throw new Error("An administrator-owned conversation is required.");
const agent = await findAgent(actor.organizationId,agentId);
const existingSuite = existingSuiteId ? (await listSuites(actor)).find(s => s.id === existingSuiteId) : undefined;
if (existingSuiteId && !existingSuite) throw new Error("Evaluation suite not found in this workspace.");
const skillId = existingSuite?.skillId ?? (await saveSkill(actor,{expectedVersion:0,name:"Follow-up classification · synthetic evaluation",description:"Evaluation baseline based on the follow-up agent's instructions. Synthetic data only.",instructions:agent.instructions,expectedOutput:"Separate confirmed assignments from suggestions, give evidence and mark missing owner or deadline.",requiredToolkits:[]})).id;
const samples = [
  ["Explicit request", "Alice says to Sam: ‘Sam, please send the revised proposal by Friday.’", "CONFIRMED"],
  ["Explicit commitment", "Sam says: ‘I will send the revised proposal by Friday.’", "CONFIRMED"],
  ["Automated alert", "An automated build notification says ‘Build failed’. No person assigns work.", "SUGGESTION"],
  ["Unassigned group request", "A message says ‘Someone should review this’, with no named owner or commitment.", "UNCLEAR"],
  ["Meeting without action", "A calendar event titled ‘Project discussion’ lists Sam as attendee. There are no meeting notes.", "SUGGESTION"],
  ["Missing deadline", "Alice tells Sam: ‘Sam, please review the proposal.’ No deadline is mentioned.", "CONFIRMED"],
];
const cases = samples.map(([name,source,expected])=>({id:crypto.randomUUID(),name,input:`Synthetic source: ${source}\nThe user is Sam. Classify whether there is a confirmed personal assignment. Begin your answer with exactly one label: CONFIRMED, SUGGESTION, or UNCLEAR. Explain the evidence and any missing owner or deadline.`,checks:{contains:[],notContains:[],firstLineEquals:expected,maxChars:2000}}));
const suite = await createSuite(actor,{id:existingSuite?.id,expectedRevision:existingSuite?.revision || 0,skillId,name:"Follow-up classification · six synthetic cases",cases});
const run = await startEvaluation(actor,{suiteId:suite.id,provider:agent.provider,model:agent.model});
console.log(JSON.stringify({skillId,suiteId:suite.id,runId:run.id,status:run.status}));
await evalQueue().close(); await getRedis().quit(); await getSql().end();
