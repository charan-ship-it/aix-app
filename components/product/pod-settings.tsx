"use client";
import { useState, useEffect } from "react";
import { Lock, Users } from "lucide-react";
import type { Pod } from "@/lib/pods";
import type { AgentConfig } from "@/lib/agent-config";
import { ProductModal } from "./modal";
export function CreatePod({
  agents,
  onClose,
  onCreate,
}: {
  agents: AgentConfig[];
  onClose: () => void;
  onCreate: (p: Pod) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [access, setAccess] = useState<Pod["access"]>("private"),
    [defaultAgentId, setAgent] = useState(
      agents.find((a) => a.id === "xcelerate")?.id || agents[0]?.id || "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <ProductModal title="Create a Pod" onClose={onClose}>
      <form
        className="product-modal-body product-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onCreate({
              id: crypto.randomUUID(),
              name,
              description,
              access,
              defaultAgentId,
              instructions: "",
              archived: false,
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="product-form-intro">
          Keep a project’s conversations, files, and tasks in one place. You can
          add context and invite your organization after creating it.
        </p>
        <label>
          Pod name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Product launch"
          />
        </label>
        <label>
          What is this project for?
          <textarea
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the goal or outcome."
          />
        </label>
        <label>
          Default agent
          <select
            required
            value={defaultAgentId}
            onChange={(e) => setAgent(e.target.value)}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <small>
            Preselected for new conversations. You can choose another agent when
            starting work.
          </small>
        </label>
        <fieldset>
          <legend>Who can access this Pod?</legend>
          <label className="product-radio">
            <input
              type="radio"
              name="access"
              checked={access === "private"}
              onChange={() => setAccess("private")}
            />
            <span>
              <strong>Private</strong>
              <small>Only you can access this Pod.</small>
            </span>
            <Lock size={16} />
          </label>
          <label className="product-radio">
            <input
              type="radio"
              name="access"
              checked={access === "organization"}
              onChange={() => setAccess("organization")}
            />
            <span>
              <strong>Organization</strong>
              <small>
                All organization members can access its files and context.
              </small>
            </span>
            <Users size={16} />
          </label>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="product-modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy || !defaultAgentId}>
            {busy ? "Creating…" : "Create Pod"}
          </button>
        </div>
      </form>
    </ProductModal>
  );
}
export function PodSettings({
  pod,
  agents,
  canEdit,
  onSave,
  onArchive,
}: {
  pod: Pod;
  agents: AgentConfig[];
  canEdit: boolean;
  onSave: (pod: Pod) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(pod),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [archiveConfirm, setArchiveConfirm] = useState(false);
  useEffect(() => setDraft(pod), [pod]);
  return (
    <div className="product-pod-settings">
      <form
        className="product-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(draft);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <section>
          <h2>General</h2>
          <p>Help people and agents understand this project.</p>
          <label>
            Pod name
            <input
              required
              disabled={!canEdit}
              value={draft.name}
              maxLength={80}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Description
            <textarea
              disabled={!canEdit}
              value={draft.description}
              maxLength={500}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
        </section>
        <section>
          <h2>Context for agents</h2>
          <p>
            These instructions apply whenever an agent works in this Pod. The
            agent keeps its own role and tools.
          </p>
          <label>
            Pod instructions
            <textarea
              disabled={!canEdit}
              className="product-pod-instructions"
              maxLength={16000}
              value={draft.instructions}
              onChange={(e) =>
                setDraft({ ...draft, instructions: e.target.value })
              }
              placeholder="Project goals, constraints, preferred output, and decisions agents should know."
            />
          </label>
          <label>
            Default agent
            <select
              disabled={!canEdit}
              value={draft.defaultAgentId}
              onChange={(e) =>
                setDraft({ ...draft, defaultAgentId: e.target.value })
              }
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section>
          <h2>Access</h2>
          <label>
            Pod visibility
            <select
              disabled={!canEdit}
              value={draft.access}
              onChange={(e) =>
                setDraft({ ...draft, access: e.target.value as Pod["access"] })
              }
            >
              <option value="private">Private · only you</option>
              <option value="organization">Organization · all members</option>
            </select>
          </label>
          <p className="settings-note">
            Files and project context follow this setting. Conversations and
            task runs stay private to their author.
          </p>
        </section>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !canEdit}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        {!canEdit && (
          <p className="settings-note">
            Only the Pod owner or an organization admin can change these
            settings.
          </p>
        )}
      </form>
      {canEdit && (
        <section className="product-archive-line">
          <div>
            <h2>Archive Pod</h2>
            <p>
              Keep the project’s history and remove it from active navigation.
            </p>
          </div>
          <button className="secondary" onClick={() => setArchiveConfirm(true)}>
            Archive Pod
          </button>
        </section>
      )}
      {archiveConfirm && (
        <ProductModal
          title="Archive this Pod?"
          onClose={() => setArchiveConfirm(false)}
        >
          <div className="product-modal-body">
            <p>
              Conversations, files, and tasks are preserved. You can restore it
              from Pods.
            </p>
            <div className="product-modal-actions">
              <button
                className="secondary"
                onClick={() => setArchiveConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onArchive();
                    setArchiveConfirm(false);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Archive Pod
              </button>
            </div>
          </div>
        </ProductModal>
      )}
    </div>
  );
}
