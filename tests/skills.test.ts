import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { getSql } from "../db";
import { skillContentSchema, skillTemplates } from "../lib/skills";
import { archiveSkill, listSkills, listSkillVersions, resolveSkillInstructions, saveSkill } from "../lib/server/skills";
import type { WorkspaceUser } from "../lib/server/http";
try { process.loadEnvFile(); } catch {}
const sql = getSql(), stamp = crypto.randomUUID();
const orgId = `skill-test-org-${stamp}`, otherOrg = `skill-test-other-${stamp}`, userId = `skill-test-user-${stamp}`;
const owner: WorkspaceUser = { userId, organizationId: orgId, organizationName: "Skill test", displayName: "Skill fixture admin", email: `${stamp}@example.invalid`, role: "owner" };
before(async () => {
  await sql`insert into auth_user(id,name,email) values(${userId},${owner.displayName},${owner.email})`;
  await sql`insert into organization(id,name,slug) values(${orgId},'Skill fixture',${orgId}),(${otherOrg},'Other skill fixture',${otherOrg})`;
});
after(async () => {
  await sql`delete from organization where id in (${orgId},${otherOrg})`;
  await sql`delete from auth_user where id=${userId}`;
  await sql.end();
});
test("skills retain immutable revisions, reject stale concurrent publishing, and isolate organizations", async () => {
  const first = await saveSkill(owner, { ...skillTemplates[0], expectedVersion: 0 });
  assert.equal(first.version, 1);
  assert.equal((await listSkills(orgId)).some((s) => s.id === first.id), true);
  assert.equal((await listSkills(otherOrg)).some((s) => s.id === first.id), false);
  await assert.rejects(() => saveSkill({ ...owner, role: "member" }, { ...first, expectedVersion: first.version }), { status: 403 });
  await assert.rejects(() => resolveSkillInstructions(otherOrg, [first.id]), { status: 404 });
  await assert.rejects(() => listSkillVersions(otherOrg, first.id), { status: 404 });
  await assert.rejects(() => resolveSkillInstructions(orgId, [first.id, first.id]), { status: 400 });
  const variants = await Promise.allSettled([
    saveSkill(owner, { ...first, instructions: "First concurrent revision with explicit evidence requirements.", expectedVersion: 1 }),
    saveSkill(owner, { ...first, instructions: "Second concurrent revision with explicit evidence requirements.", expectedVersion: 1 }),
  ]);
  assert.equal(variants.filter((v) => v.status === "fulfilled").length, 1);
  const rejected = variants.find((v) => v.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason.status, 409);
  const versions = await listSkillVersions(orgId, first.id);
  assert.deepEqual(versions.map((v) => v.version), [2, 1]);
  assert.equal(versions[1].instructions, first.instructions);
  const snapshot = await resolveSkillInstructions(orgId, [first.id]);
  assert.equal(snapshot.skills[0].version, 2);
  assert.match(snapshot.instructions, /version 2/);
  assert.deepEqual(snapshot.skills[0].requiredToolkits, ["gmail", "googlecalendar"]);
  const archived = await archiveSkill(owner, { id: first.id, expectedVersion: 2, archived: true });
  assert.equal(archived.version, 3);
  assert.equal((await listSkills(orgId)).some((s) => s.id === first.id), false);
  assert.equal((await listSkills(orgId, true)).some((s) => s.id === first.id), true);
  await assert.rejects(() => resolveSkillInstructions(orgId, [first.id]), { status: 409 });
  await assert.rejects(() => archiveSkill({ ...owner, organizationId: otherOrg }, { id: first.id, expectedVersion: 3, archived: false }), { status: 404 });
  const restored = await archiveSkill(owner, { id: first.id, expectedVersion: 3, archived: false });
  assert.equal(restored.version, 4);
  assert.equal((await resolveSkillInstructions(orgId, [first.id])).skills[0].version, 4);
  assert.equal((await listSkillVersions(orgId, first.id)).find((v) => v.version === 1)?.instructions, first.instructions);
});
test("skill content bounds and app requirements are validated without granting tools", async () => {
  assert.equal(skillContentSchema.safeParse({ ...skillTemplates[1], requiredToolkits: ["untrusted-toolkit"] }).success, false);
  assert.equal(skillContentSchema.safeParse({ ...skillTemplates[1], requiredToolkits: ["gmail", "gmail"] }).success, false);
  assert.equal(skillContentSchema.safeParse({ ...skillTemplates[1], instructions: "too short" }).success, false);
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) ids.push((await saveSkill(owner, { ...skillTemplates[1], name: `Bounded skill ${i}`, instructions: "x".repeat(5900), expectedVersion: 0 })).id);
  await assert.rejects(() => resolveSkillInstructions(orgId, ids), { status: 400 });
});
