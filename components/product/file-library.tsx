"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Upload,
  Plus,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
  Check,
  Pencil,
} from "lucide-react";
import { FileText, Folder, X, Trash2 } from "@/components/mike-icons";
import type { Document } from "@/lib/workspace";
import type { FileFolder } from "@/lib/folders";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./file-library.css";

type Props = {
  podId?: string;
  agentId?: string;
  documents: Document[];
  onChange: () => void;
  companyDocuments?: Document[];
};
type Dialog = {
  kind: "note" | "folder" | "rename" | "attach" | "delete";
  folder?: FileFolder;
  document?: Document;
} | null;
async function request(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The request could not be completed.");
  return result;
}
function date(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function status(document: Document) {
  return document.status === "failed"
    ? "Needs attention"
    : ["queued", "indexing", "processing"].includes(document.status || "")
      ? "Indexing"
      : document.status === "ready" || document.status === "indexed"
        ? "Ready"
        : "Saved";
}

export function FileLibrary({
  podId,
  agentId,
  documents,
  onChange,
  companyDocuments = [],
}: Props) {
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [folderId, setFolderId] = useState<string>();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [previewId, setPreviewId] = useState<string>();
  const [menuId, setMenuId] = useState<string>();
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const scope = { podId, agentId };
  const scopeQuery = new URLSearchParams(
    podId ? { podId } : agentId ? { agentId } : {},
  ).toString();
  const loadFolders = useCallback(async () => {
    try {
      const data = await request(`/api/folders?${scopeQuery}`);
      setFolders(data.folders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Folders could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);
  useEffect(() => {
    setFolderId(undefined);
    setPreviewId(undefined);
    setLoading(true);
    void loadFolders();
  }, [loadFolders]);
  useEffect(() => {
    if (
      !documents.some((d) =>
        ["queued", "indexing", "processing"].includes(d.status || ""),
      )
    )
      return;
    const timer = setInterval(onChange, 4000);
    return () => clearInterval(timer);
  }, [documents, onChange]);
  useEffect(() => {
    if (!dialog && !previewId) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>(
      ".file-v2-overlay [role='dialog']",
    );
    const focusable = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]",
        ) || [],
      );
    (
      modal?.querySelector<HTMLElement>("input, textarea") || focusable()[0]
    )?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      if (event.key === "Escape") {
        setDialog(null);
        setPreviewId(undefined);
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [dialog, previewId]);

  const ownDocuments = documents.filter((d) =>
    podId
      ? d.podId === podId
      : agentId
        ? !d.podId && d.agentId === agentId
        : !d.podId && !d.agentId,
  );
  const selected = documents.find((d) => d.id === previewId);
  const path: FileFolder[] = [];
  let current = folders.find((f) => f.id === folderId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = folders.find((f) => f.id === current?.parentId);
  }
  const matchingFolders = folders
    .filter((f) =>
      query
        ? f.name.toLowerCase().includes(query.toLowerCase())
        : (f.parentId || undefined) === folderId,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const matchingDocuments = ownDocuments
    .filter((d) =>
      query
        ? d.name.toLowerCase().includes(query.toLowerCase())
        : (d.folderId || undefined) === folderId,
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  const shared = companyDocuments.filter((d) => !d.podId && !d.agentId);

  function open(next: NonNullable<Dialog>) {
    setError("");
    setDialog(next);
    setName(next.folder?.name || "");
    setContent("");
    setMenuId(undefined);
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      onChange();
      await loadFolders();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveDocument(file: Pick<Document, "name" | "content">) {
    await request("/api/workspace", {
      kind: "document",
      data: {
        ...file,
        ...scope,
        folderId,
        id: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
      },
    });
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const batch = Array.from(files);
    await perform(async () => {
      for (const file of batch) {
        if (!/\.(txt|md|csv)$/i.test(file.name))
          throw new Error("Upload a .txt, .md, or .csv file.");
        if (file.size > 450000)
          throw new Error(
            `${file.name} is too large. Choose a file smaller than 450 KB.`,
          );
      }
      let count = 0;
      for (const file of batch) {
        try {
          const text = await file.text();
          if (!text.trim()) throw new Error(`${file.name} is empty.`);
          await saveDocument({ name: file.name, content: text });
          count++;
        } catch (e) {
          if (count) onChange();
          throw e;
        }
      }
      setNotice(
        `${count} ${count === 1 ? "file uploaded" : "files uploaded"}. Indexing will continue in the background.`,
      );
    });
    if (input.current) input.current.value = "";
  }
  async function submit() {
    if (!dialog) return;
    await perform(async () => {
      if (dialog.kind === "note") {
        if (!name.trim() || !content.trim())
          throw new Error("Add a title and some content for your note.");
        if (content.length > 450000)
          throw new Error("Keep notes under 450,000 characters.");
        await saveDocument({
          name: /\.md$/i.test(name.trim()) ? name.trim() : `${name.trim()}.md`,
          content,
        });
        setNotice("Note saved. It will be available to agents after indexing.");
      } else if (dialog.kind === "folder" || dialog.kind === "rename") {
        if (!name.trim()) throw new Error("Give the folder a name.");
        await request("/api/folders", {
          ...scope,
          action: dialog.kind === "folder" ? "create" : "rename",
          id: dialog.folder?.id,
          parentId: dialog.kind === "folder" ? folderId : undefined,
          name: name.trim(),
        });
      } else if (dialog.kind === "delete") {
        if (dialog.folder)
          await request("/api/folders", {
            ...scope,
            action: "delete",
            id: dialog.folder.id,
          });
        if (dialog.document) {
          await request("/api/workspace", {
            kind: "document",
            action: "delete",
            data: { id: dialog.document.id },
          });
          if (previewId === dialog.document.id) setPreviewId(undefined);
        }
      }
      setDialog(null);
    });
  }

  return (
    <section className="file-v2" aria-label="File library">
      <div className="file-v2-heading">
        <div>
          <h2>Files</h2>
          <p>
            {podId
              ? "A shared source of context for every conversation in this Pod."
              : agentId
                ? "Reference material this agent can use in its work."
                : "Company knowledge your team can give to agents."}
          </p>
        </div>
        <div className="file-v2-actions">
          <button disabled={busy} onClick={() => open({ kind: "folder" })}>
            <Folder size={16} />
            New folder
          </button>
          {podId && (
            <button disabled={busy} onClick={() => open({ kind: "attach" })}>
              Add company file
            </button>
          )}
          <button disabled={busy} onClick={() => open({ kind: "note" })}>
            <Plus size={16} />
            Write a note
          </button>
          <button
            className="file-v2-primary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={16} />
            {busy ? "Saving…" : "Upload files"}
          </button>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept=".txt,.md,.csv"
        multiple
        hidden
        onChange={(event) => void upload(event.target.files)}
      />
      {error && (
        <div role="alert" className="file-v2-error">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="file-v2-notice">
          <Check size={16} />
          {notice}
        </div>
      )}
      <div className="file-v2-toolbar">
        <nav aria-label="Folder breadcrumb">
          <button
            onClick={() => {
              setFolderId(undefined);
              setQuery("");
            }}
          >
            All files
          </button>
          {path.map((folder) => (
            <span key={folder.id}>
              <ChevronRight size={14} />
              <button
                onClick={() => {
                  setFolderId(folder.id);
                  setQuery("");
                }}
              >
                {folder.name}
              </button>
            </span>
          ))}
        </nav>
        <div>
          <label className="file-v2-search">
            <Search size={16} />
            <input
              aria-label="Search files and folders"
              placeholder="Search files…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Sort files"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="updated">Last updated</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>
      <div className="file-v2-table">
        <div className="file-v2-table-head">
          <span>Name</span>
          <span>Status</span>
          <span>Updated</span>
          <span />
        </div>
        {loading ? (
          <div className="file-v2-empty" role="status">
            Loading files…
          </div>
        ) : !matchingFolders.length && !matchingDocuments.length ? (
          <div className="file-v2-empty">
            <span className="file-v2-empty-icon">
              <Folder size={26} />
            </span>
            <h3>
              {query ? "No matching files" : "Give your work some context"}
            </h3>
            <p>
              {query
                ? "Try another search or clear your filters."
                : "Upload a document or write a note. Agents can use these files when answering questions and completing tasks."}
            </p>
            {!query && (
              <button onClick={() => input.current?.click()}>
                <Upload size={16} />
                Upload your first file
              </button>
            )}
          </div>
        ) : (
          <>
            {matchingFolders.map((folder) => (
              <div className="file-v2-row" key={folder.id}>
                <button
                  className="file-v2-name"
                  onClick={() => {
                    setFolderId(folder.id);
                    setQuery("");
                  }}
                >
                  <Folder size={19} />
                  <span>{folder.name}</span>
                </button>
                <span className="file-v2-status">Folder</span>
                <span className="file-v2-date">{date(folder.updatedAt)}</span>
                <div className="file-v2-row-menu">
                  <button
                    aria-label={`Actions for ${folder.name}`}
                    onClick={() =>
                      setMenuId(menuId === folder.id ? undefined : folder.id)
                    }
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {menuId === folder.id && (
                    <div className="file-v2-menu">
                      <button onClick={() => open({ kind: "rename", folder })}>
                        <Pencil size={14} />
                        Rename
                      </button>
                      <button onClick={() => open({ kind: "delete", folder })}>
                        <Trash2 size={14} />
                        Delete folder
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {matchingDocuments.map((file) => (
              <div className="file-v2-row" key={file.id}>
                <button
                  className="file-v2-name"
                  onClick={() => setPreviewId(file.id)}
                >
                  <FileText size={19} />
                  <span>
                    {file.name}
                    <small>
                      {file.content.length.toLocaleString()} characters
                      {query && file.folderId ? " · In folder" : ""}
                    </small>
                  </span>
                </button>
                <span
                  className={`file-v2-status ${file.status === "failed" ? "is-error" : ""}`}
                >
                  <i />
                  {status(file)}
                </span>
                <span className="file-v2-date">{date(file.updatedAt)}</span>
                <div className="file-v2-row-menu">
                  <button
                    aria-label={`Actions for ${file.name}`}
                    onClick={() =>
                      setMenuId(menuId === file.id ? undefined : file.id)
                    }
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {menuId === file.id && (
                    <div className="file-v2-menu">
                      <button
                        disabled={busy}
                        onClick={() => {
                          setMenuId(undefined);
                          void perform(async () => {
                            await request("/api/workspace", {
                              kind: "document",
                              action: "reindex",
                              data: { id: file.id },
                            });
                            setNotice("Indexing restarted.");
                          });
                        }}
                      >
                        <RefreshCw size={14} />
                        Reindex
                      </button>
                      <button
                        onClick={() => open({ kind: "delete", document: file })}
                      >
                        <Trash2 size={14} />
                        Delete file
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <p className="file-v2-hint">
        Text, Markdown, and CSV · Up to 450 KB per file
        {podId ? " · Files follow this Pod’s access settings" : ""}
      </p>
      {selected && !dialog && (
        <div
          className="file-v2-overlay"
          onClick={() => setPreviewId(undefined)}
        >
          <section
            className="file-v2-preview"
            role="dialog"
            aria-modal="true"
            aria-label={selected.name}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <FileText size={20} />
                <h3>{selected.name}</h3>
              </div>
              <button
                autoFocus
                aria-label="Close file preview"
                onClick={() => setPreviewId(undefined)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="file-v2-preview-meta">
              <span>{status(selected)}</span>
              <span>Updated {date(selected.updatedAt)}</span>
            </div>
            {selected.indexError && (
              <div className="file-v2-error">{selected.indexError}</div>
            )}
            <article className="file-v2-preview-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {selected.content}
              </ReactMarkdown>
            </article>
          </section>
        </div>
      )}
      {dialog && (
        <div
          className="file-v2-overlay"
          onClick={() => !busy && setDialog(null)}
        >
          <form
            className={`file-v2-dialog ${dialog.kind === "note" ? "file-v2-note" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-v2-dialog-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <header>
              <h3 id="file-v2-dialog-title">
                {dialog.kind === "note"
                  ? "Write a note"
                  : dialog.kind === "folder"
                    ? "New folder"
                    : dialog.kind === "rename"
                      ? "Rename folder"
                      : dialog.kind === "attach"
                        ? "Add company file"
                        : `Delete ${dialog.folder ? "folder" : "file"}?`}
              </h3>
              <button
                type="button"
                disabled={busy}
                aria-label="Close dialog"
                onClick={() => setDialog(null)}
              >
                <X size={18} />
              </button>
            </header>
            {error && (
              <div role="alert" className="file-v2-error">
                {error}
              </div>
            )}
            {dialog.kind === "attach" ? (
              <div className="file-v2-attach">
                <p>
                  A copy is added to this Pod. Changes to the original will stay
                  in the company library.
                </p>
                {!shared.length ? (
                  <p>
                    No company files yet. Add a file to company knowledge first.
                  </p>
                ) : (
                  shared.map((file) => (
                    <button
                      type="button"
                      key={file.id}
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          await saveDocument({
                            name: file.name,
                            content: file.content,
                          });
                          setNotice(`${file.name} added to this Pod.`);
                          setDialog(null);
                        })
                      }
                    >
                      <FileText size={18} />
                      <span>{file.name}</span>
                      <Plus size={16} />
                    </button>
                  ))
                )}
              </div>
            ) : dialog.kind === "delete" ? (
              <p className="file-v2-delete-copy">
                {dialog.folder
                  ? `Delete “${dialog.folder.name}”? Only empty folders can be deleted.`
                  : `Remove “${dialog.document?.name}” and its indexed content from this library?`}
              </p>
            ) : (
              <>
                <label>
                  {dialog.kind === "note" ? "Title" : "Folder name"}
                  <input
                    autoFocus
                    maxLength={dialog.kind === "note" ? 250 : 120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      dialog.kind === "note"
                        ? "e.g. Brand voice and guidelines"
                        : "e.g. Project research"
                    }
                    required
                  />
                </label>
                {dialog.kind === "note" && (
                  <label>
                    Content
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Write your reference material here. Markdown is supported."
                      required
                    />
                  </label>
                )}
              </>
            )}
            <footer>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              {dialog.kind !== "attach" && (
                <button
                  className={
                    dialog.kind === "delete"
                      ? "file-v2-danger"
                      : "file-v2-primary"
                  }
                  disabled={busy}
                  type="submit"
                >
                  {busy
                    ? "Saving…"
                    : dialog.kind === "delete"
                      ? "Delete"
                      : dialog.kind === "note"
                        ? "Save note"
                        : dialog.kind === "rename"
                          ? "Save name"
                          : "Create folder"}
                </button>
              )}
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
