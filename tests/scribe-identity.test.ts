import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { getDb, getSql } from "../db";
import { user, member, organization, records } from "../db/schema";
import { assertVerifiedScribeOwner, canViewImportedScribeTask } from "../lib/server/scribe-identity";
import { listPersonalTasks, syncScribe } from "../lib/server/my-work";
import { getRedis } from "../lib/server/redis";
import type { WorkspaceUser } from "../lib/server/http";
try { process.loadEnvFile(); } catch {}
const redis = new URL(process.env.REDIS_URL!); redis.pathname = "/12"; process.env.REDIS_URL = redis.toString();
const suffix = crypto.randomUUID(), orgId = `scribe-org-${suffix}`, userId = `scribe-user-${suffix}`;
const email = `${userId}@example.invalid`, db = getDb();
const actor: WorkspaceUser = {organizationId:orgId,userId,email,displayName:"Fixture",organizationName:"Fixture",role:"member"};
after(async () => { await db.delete(organization).where(eq(organization.id,orgId)); await db.delete(user).where(eq(user.id,userId)); await getRedis().quit(); await getSql().end(); });

test("verified exact account email is required; self-confirmation alone cannot authorize another address", () => {
  assert.throws(() => assertVerifiedScribeOwner("a@example.invalid",undefined),/Verify your AIX/);
  assert.throws(() => assertVerifiedScribeOwner("a@example.invalid",{email:"a@example.invalid",emailVerified:false}),/Verify your AIX/);
  assert.throws(() => assertVerifiedScribeOwner("other@example.invalid",{email:"a@example.invalid",emailVerified:true}),/must match/);
  assert.doesNotThrow(() => assertVerifiedScribeOwner("  A@EXAMPLE.INVALID ",{email:"a@example.invalid",emailVerified:true}));
  assert.equal(canViewImportedScribeTask({source:{kind:"scribe",ownerEmail:"other@example.invalid"}},{email:"a@example.invalid",emailVerified:true}),false);
  assert.equal(canViewImportedScribeTask({source:{kind:"scribe",ownerEmail:"a@example.invalid"}},{email:"a@example.invalid",emailVerified:false}),false);
  assert.equal(canViewImportedScribeTask({source:{kind:"manual"}},undefined),true);
});

test("legacy mappings cannot reach Scribe without a currently verified matching member identity", async () => {
  await db.insert(user).values({id:userId,name:"Fixture",email,emailVerified:false});
  await db.insert(organization).values({id:orgId,name:"Fixture",slug:orgId});
  await db.insert(member).values({id:crypto.randomUUID(),organizationId:orgId,userId,role:"member"});
  const id = `personal-work-settings:${userId}`;
  await db.insert(records).values({id,organizationId:orgId,createdBy:userId,kind:"personal-work-settings",data:{id,connectionId:crypto.randomUUID(),ownerEmail:"other@example.invalid",ownerConfirmedAt:new Date().toISOString()}});
  await db.insert(records).values({id:"legacy-import",organizationId:orgId,createdBy:userId,kind:"personal-task",data:{id:"legacy-import",source:{kind:"scribe",ownerEmail:"other@example.invalid"}}});
  assert.equal((await listPersonalTasks(actor)).length,0);
  await assert.rejects(syncScribe(actor),/Verify your AIX/);
  await db.update(user).set({emailVerified:true}).where(eq(user.id,userId));
  assert.equal((await listPersonalTasks(actor)).length,0);
  await assert.rejects(syncScribe(actor),/must match/);
  await db.update(records).set({data:{id,connectionId:crypto.randomUUID(),ownerEmail:email,ownerConfirmedAt:new Date().toISOString()}}).where(eq(records.id,id));
  await db.update(records).set({data:{id:"legacy-import",source:{kind:"scribe",ownerEmail:email}}}).where(eq(records.id,"legacy-import"));
  assert.equal((await listPersonalTasks(actor)).length,1);
  await assert.rejects(syncScribe(actor),/Select an enabled Scribe connection/);
  await db.delete(member).where(eq(member.userId,userId));
  await assert.rejects(syncScribe(actor),/Verify your AIX/);
});
