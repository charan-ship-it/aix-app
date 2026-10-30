import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { AppError, requireAdmin, type WorkspaceUser } from "./http";
import { formatSkillInstructions, skillArchiveSchema, skillSaveSchema, skillSchema, type Skill, type SkillSnapshot } from "@/lib/skills";

function skillWhere(organizationId: string, id: string) {
  return and(eq(records.organizationId, organizationId), eq(records.id, id), eq(records.kind, "skill"));
}
export async function listSkills(organizationId: string, includeArchived = false) {
  const rows = await getDb().select({ data: records.data }).from(records).where(and(
    eq(records.organizationId, organizationId), eq(records.kind, "skill"),
    ...(includeArchived ? [] : [sql`${records.data}->>'archived'='false'`]),
  )).orderBy(desc(records.updatedAt)).limit(200);
  return rows.map((row) => skillSchema.parse(row.data));
}
export async function saveSkill(u: WorkspaceUser, value: unknown): Promise<Skill> {
  requireAdmin(u);
  const parsed = skillSaveSchema.safeParse(value);
  if (!parsed.success) throw new AppError(400, "Enter a name, instructions, and valid app requirements for this skill.");
  const { id = crypto.randomUUID(), expectedVersion, ...content } = parsed.data;
  return getDb().transaction(async (tx) => {
    const [existing] = await tx.select().from(records).where(skillWhere(u.organizationId, id)).for("update").limit(1);
    const current = existing ? skillSchema.parse(existing.data) : undefined;
    if ((current?.version || 0) !== expectedVersion) throw new AppError(409, "This skill changed. Reload it before publishing your version.");
    if (current) {
      const [coverage] = await tx.select({id: records.id}).from(records).where(and(eq(records.organizationId, u.organizationId), eq(records.kind, "eval-suite"), sql`${records.data}->>'skillId'=${id}`)).limit(1);
      if (coverage) throw new AppError(409, "This skill has evaluation coverage. Share an improvement in Learning & evals and publish it with current passing evaluation evidence.");
    }
    const updatedAt = new Date();
    const skill = skillSchema.parse({ ...content, id, version: expectedVersion + 1, archived: current?.archived || false, updatedAt: updatedAt.toISOString() });
    if (existing) await tx.update(records).set({ data: skill, updatedAt }).where(skillWhere(u.organizationId, id));
    else await tx.insert(records).values({ organizationId: u.organizationId, createdBy: u.userId, id, kind: "skill", data: skill });
    await tx.insert(records).values({ organizationId: u.organizationId, createdBy: u.userId, id: `skill-version:${id}:${skill.version}`, kind: "skill-version", data: { ...skill, publishedBy: u.displayName } });
    return skill;
  });
}
export async function archiveSkill(u: WorkspaceUser, value: unknown): Promise<Skill> {
  requireAdmin(u);
  const parsed = skillArchiveSchema.safeParse(value);
  if (!parsed.success) throw new AppError(400, "Choose a skill and its current version.");
  const { id, expectedVersion, archived } = parsed.data;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(records).where(skillWhere(u.organizationId, id)).for("update").limit(1);
    if (!row) throw new AppError(404, "Skill not found.");
    const current = skillSchema.parse(row.data);
    if (current.version !== expectedVersion) throw new AppError(409, "This skill changed. Reload it before updating its availability.");
    const updatedAt = new Date();
    const skill: Skill = { ...current, archived, version: current.version + 1, updatedAt: updatedAt.toISOString() };
    await tx.update(records).set({ data: skill, updatedAt }).where(skillWhere(u.organizationId, id));
    await tx.insert(records).values({ organizationId: u.organizationId, createdBy: u.userId, id: `skill-version:${id}:${skill.version}`, kind: "skill-version", data: { ...skill, publishedBy: u.displayName } });
    return skill;
  });
}
export async function listSkillVersions(organizationId: string, id: string) {
  const [current] = await getDb().select({ id: records.id }).from(records).where(skillWhere(organizationId, id)).limit(1);
  if (!current) throw new AppError(404, "Skill not found.");
  const rows = await getDb().select({ data: records.data }).from(records).where(and(eq(records.organizationId, organizationId), eq(records.kind, "skill-version"), sql`${records.data}->>'id'=${id}`)).orderBy(desc(sql`(${records.data}->>'version')::integer`)).limit(50);
  return rows.map((row) => ({ ...skillSchema.parse(row.data), publishedBy: typeof (row.data as { publishedBy?: unknown }).publishedBy === "string" ? (row.data as { publishedBy: string }).publishedBy : "Workspace admin" }));
}
export async function resolveSkillInstructions(organizationId: string, skillIds: string[]): Promise<{ instructions: string; skills: SkillSnapshot[] }> {
  if (!skillIds.length) return { instructions: "", skills: [] };
  if (skillIds.length > 8 || new Set(skillIds).size !== skillIds.length) throw new AppError(400, "Select up to eight different skills.");
  const selected: Skill[] = [];
  for (const id of skillIds) {
    const [row] = await getDb().select({ data: records.data }).from(records).where(skillWhere(organizationId, id)).limit(1);
    if (!row) throw new AppError(404, "A selected skill is unavailable in this organization. Review the agent’s skills.");
    const skill = skillSchema.parse(row.data);
    if (skill.archived) throw new AppError(409, `The skill “${skill.name}” is archived. Review the agent’s skills.`);
    selected.push(skill);
  }
  const instructions = formatSkillInstructions(selected);
  if (instructions.length > 32000) throw new AppError(400, "These skills exceed the instruction limit. Select fewer skills.");
  return { instructions, skills: selected.map(({ id, name, version, requiredToolkits }) => ({ id, name, version, requiredToolkits })) };
}
