import { createHash } from "node:crypto";

/** Stable member-within-organization identity in the SDK's restricted ID alphabet. */
export function observerOwnerId(user: { organizationId: string; userId: string }): string {
  // A serialized tuple avoids concatenation collisions; hashing also avoids forwarding
  // raw tenant/member identifiers. The SDK accepts at most 128 characters from
  // /^[\w.@:=-]+$/ (runtime 1.83.0 resolve-intelligence-user/intelligence-utils).
  return "aix_" + createHash("sha256").update(JSON.stringify([user.organizationId, user.userId])).digest("hex");
}
