import { after, test } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { getDb, getSql } from "../db";
import { user, organization, records } from "../db/schema";
import { getPersonalTimezone, setPersonalTimezone } from "../lib/server/personal-timezone";
try { process.loadEnvFile(); } catch {}
const suffix = crypto.randomUUID();
const orgA = `timezone-a-${suffix}`, orgB = `timezone-b-${suffix}`, userA = `timezone-user-a-${suffix}`, userB = `timezone-user-b-${suffix}`;
const db = getDb();
after(async () => { await db.delete(records).where(inArray(records.organizationId,[orgA,orgB])); await db.delete(organization).where(inArray(organization.id,[orgA,orgB])); await db.delete(user).where(inArray(user.id,[userA,userB])); await getSql().end(); });
test("personal timezones remain isolated by both user and organization", async () => {
  await db.insert(user).values([{id:userA,name:"Fixture A",email:`${userA}@example.invalid`},{id:userB,name:"Fixture B",email:`${userB}@example.invalid`}]);
  await db.insert(organization).values([{id:orgA,name:"Fixture A",slug:orgA},{id:orgB,name:"Fixture B",slug:orgB}]);
  const a = {organizationId:orgA,userId:userA}, b = {organizationId:orgA,userId:userB}, otherOrg = {organizationId:orgB,userId:userA};
  assert.equal(await getPersonalTimezone(a),null);
  await setPersonalTimezone(a,"Asia/Kolkata");
  await setPersonalTimezone(b,"America/New_York");
  await setPersonalTimezone(otherOrg,"Europe/London");
  assert.equal(await getPersonalTimezone(a),"Asia/Kolkata");
  assert.equal(await getPersonalTimezone(b),"America/New_York");
  assert.equal(await getPersonalTimezone(otherOrg),"Europe/London");
  await setPersonalTimezone(a,"UTC");
  assert.equal(await getPersonalTimezone(a),"UTC");
  assert.equal(await getPersonalTimezone(b),"America/New_York");
});
