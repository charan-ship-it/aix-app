import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { member, user } from "@/db/schema";
import { AppError } from "./http";

export function assertVerifiedScribeOwner(ownerEmail: string, account: { email: string; emailVerified: boolean } | undefined) {
  if (!account?.emailVerified) throw new AppError(403, "Verify your AIX account email before importing Scribe assignments. Email verification is not yet available in this local setup.");
  if (ownerEmail.trim().toLowerCase() !== account.email.trim().toLowerCase()) throw new AppError(403, "The Scribe owner email must match your verified AIX account email. Other addresses cannot be imported.");
}

export function canViewImportedScribeTask(task: {source?: {kind?: string; ownerEmail?: string}}, account: {email:string;emailVerified:boolean} | undefined) {
  if (task.source?.kind !== "scribe") return true;
  try { assertVerifiedScribeOwner(task.source.ownerEmail || "", account); return true; } catch { return false; }
}

export async function verifiedScribeAccount(organizationId: string, userId: string) {
  const [account] = await getDb().select({email:user.email,emailVerified:user.emailVerified}).from(user).innerJoin(member,and(eq(member.userId,user.id),eq(member.organizationId,organizationId))).where(eq(user.id,userId)).limit(1);
  return account;
}
