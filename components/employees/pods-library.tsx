"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Box, Plus, Lock, Users } from "lucide-react";
import type { Pod } from "@/lib/pods";
import type { Agent } from "@/lib/workspace";
export function PodsLibrary() {
  const router = useRouter();
  const [pods, setPods] = useState<Pod[]>([]),
    [agents, setAgents] = useState<Agent[]>([]),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [defaultAgentId, setDefault] = useState("xcelerate"),
    [access, setAccess] = useState<Pod["access"]>("private");
  useEffect(() => {
    document.documentElement.dataset.theme =
      localStorage.getItem("aix-theme") === "light" ? "light" : "dark";
    Promise.all([
      fetch("/api/pods").then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setPods(d.items);
      }),
      fetch("/api/workspace").then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setAgents([
          ...(d.agents || []),
          ...d.records.filter(
            (r: any) =>
              r.kind === "agent" &&
              !(d.agents || []).some((a: any) => a.id === r.id),
          ),
        ]);
      }),
    ]).catch((e) => setError(e.message));
  }, []);
  return (
    <div className="employee-shell">
      <main className="employee-main">
        <header className="employee-topbar">
          <Link href="/?view=agents">
            <ArrowLeft size={15} /> Back to workspace
          </Link>
          <button className="primary" onClick={() => setOpen(!open)}>
            <Plus size={15} />
            New Pod
          </button>
        </header>
        <div className="employee-scroll">
          <div className="employee-heading">
            <span className="employee-eyebrow">PROJECT WORKSPACES</span>
            <h1>Pods</h1>
            <p>
              Bring conversations, files, tasks, and employees together around a
              project. Agents define how work gets done. Pods keep the context.
            </p>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {open && (
            <form
              className="employee-card employee-task-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const r = await fetch("/api/pods", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: crypto.randomUUID(),
                      name,
                      description,
                      defaultAgentId,
                      access,
                    }),
                  });
                  const d = await r.json();
                  if (!r.ok) throw Error(d.error);
                  router.push("/pods/" + d.item.id);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>Create a Pod</h2>
              <label>
                Pod name
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Product launch"
                />
              </label>
              <label>
                Description
                <textarea
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this project working toward?"
                />
              </label>
              <label>
                Default employee
                <select
                  value={defaultAgentId}
                  onChange={(e) => setDefault(e.target.value)}
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Access
                <select
                  value={access}
                  onChange={(e) => setAccess(e.target.value as Pod["access"])}
                >
                  <option value="private">Private · only you</option>
                  <option value="organization">
                    Organization · all members
                  </option>
                </select>
              </label>
              <div>
                <button className="primary" disabled={busy}>
                  {busy ? "Creating…" : "Create Pod"}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div className="pods-grid">
            {pods.map((p) => (
              <Link
                className="employee-card pod-card"
                key={p.id}
                href={"/pods/" + p.id}
              >
                <Box size={25} />
                <h2>{p.name}</h2>
                <p>
                  {p.description || "A workspace for your team’s next project."}
                </p>
                <div>
                  {p.access === "private" ? (
                    <Lock size={13} />
                  ) : (
                    <Users size={13} />
                  )}
                  <span>
                    {p.access === "private" ? "Private" : "Organization"}
                  </span>
                  <ArrowUpRight size={16} />
                </div>
              </Link>
            ))}
          </div>
          {!pods.length && !open && (
            <div className="employee-empty">
              <Box size={32} />
              <h3>Give your next project a home</h3>
              <p>
                Create a Pod, choose an employee, and add the context it needs.
              </p>
              <button className="primary" onClick={() => setOpen(true)}>
                Create your first Pod
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
