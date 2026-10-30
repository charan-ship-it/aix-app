"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
export function OrganizationPicker() {
  const { data: orgs } = authClient.useListOrganizations();
  const { data: active } = authClient.useActiveOrganization();
  const [error, setError] = useState("");
  return (
    <div className="organization-picker">
      <label>
        <span className="sr-only">Workspace</span>
        <select
          aria-label="Workspace"
          value={active?.id || ""}
          onChange={async (e) => {
            if (e.target.value === "__new") {
              location.href = "/onboarding";
              return;
            }
            const r = await authClient.organization.setActive({
              organizationId: e.target.value,
            });
            if (r.error)
              setError(r.error.message || "Could not switch organization.");
            else location.href = "/";
          }}
        >
          <option value="" disabled>
            Select workspace
          </option>
          {orgs?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value="__new">+ New workspace</option>
        </select>
      </label>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
export function OrganizationOnboarding() {
  const [name, setName] = useState("My workspace"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [audience, setAudience] = useState("personal");
  const { data: orgs } = authClient.useListOrganizations();
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Your workspace</h1>
        <p>
          A place for your agents, projects, and knowledge. Start on your own or
          bring a team.
        </p>
        {orgs?.map((o) => (
          <button
            className="org-choice"
            key={o.id}
            onClick={async () => {
              await authClient.organization.setActive({ organizationId: o.id });
              location.href = "/";
            }}
          >
            {o.name}
          </button>
        ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const slug =
                name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "") +
                "-" +
                crypto.randomUUID().slice(0, 6);
              const r = await authClient.organization.create({ name, slug });
              if (r.error)
                setError(r.error.message || "Could not create workspace.");
              else {
                const active = await authClient.organization.setActive({
                  organizationId: r.data.id,
                });
                if (active.error)
                  throw Error(
                    active.error.message || "Could not open your workspace.",
                  );
                location.href = "/";
              }
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not create your workspace. Try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset className="workspace-audience">
            <legend>Who is this for?</legend>
            {[
              [
                "personal",
                "Just me",
                "Research, learn, plan, and get your own work done.",
              ],
              [
                "team",
                "My team",
                "Share agents and project context with other people.",
              ],
            ].map(([id, title, description]) => (
              <label key={id}>
                <input
                  type="radio"
                  name="workspace-audience"
                  checked={audience === id}
                  onChange={() => {
                    setAudience(id);
                    if (name === "My workspace" || !name)
                      setName(id === "personal" ? "My workspace" : "");
                  }}
                />
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label>
            Workspace name
            <input
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                audience === "team" ? "Your team or project" : "My workspace"
              }
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? "Creating…" : "Create workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}
export function TeamSettings() {
  const { data: active, refetch } = authClient.useActiveOrganization();
  const { data: session } = authClient.useSession();
  const role = active?.members.find((m) => m.userId === session?.user.id)?.role;
  const admin = role === "owner" || role === "admin";
  const [email, setEmail] = useState(""),
    [inviteRole, setInviteRole] = useState<"member" | "admin">("member"),
    [message, setMessage] = useState("");
  return (
    <section className="settings-section">
      <h2>Workspace & members</h2>
      <OrganizationPicker />
      {active?.members.map((m) => (
        <div className="setting-row" key={m.id}>
          <div>
            <strong>{m.user.name}</strong>
            <p>{m.user.email}</p>
          </div>
          <span className="status-pill">{m.role}</span>
          {admin && m.role !== "owner" && (
            <button
              className="secondary"
              onClick={async () => {
                const r = await authClient.organization.removeMember({
                  memberIdOrEmail: m.id,
                });
                setMessage(r.error?.message || "Member removed.");
                refetch();
              }}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {admin && (
        <form
          className="team-invite"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await authClient.organization.inviteMember({
              email,
              role: inviteRole,
            });
            if (r.error)
              setMessage(r.error.message || "Could not create invitation.");
            else {
              setMessage(
                "Invitation created. Share this link with " +
                  email +
                  ": " +
                  location.origin +
                  "/join/" +
                  r.data.id,
              );
              setEmail("");
            }
          }}
        >
          <label>
            Invite a teammate
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
            />
          </label>
          <label>
            Role
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as "member" | "admin")
              }
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button className="primary">Create invitation link</button>
        </form>
      )}
      {message && (
        <p className="settings-note" role="status">
          {message}
        </p>
      )}
      <p className="settings-note">
        Agents and knowledge are shared with your organization. Conversations
        and connected accounts are private to each member. Only owners and
        admins manage API keys and members.
      </p>
    </section>
  );
}
