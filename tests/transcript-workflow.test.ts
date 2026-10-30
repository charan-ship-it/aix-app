import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { runTranscriptActionWorkflow, type TranscriptExtraction } from "../lib/server/workflows/transcript-actions";

const transcript = "[00:01] Casey: I will send the launch plan by Friday.\n[00:08] Morgan: Could someone write a press release?\n[00:12] Casey: Yes, the launch plan will go out by Friday.";
const extracted = (): TranscriptExtraction => ({ items: [{ action: "Send the launch plan", owner: "Casey", dueText: "by Friday", evidenceQuote: "I will send the launch plan by Friday.", clarification: "Relative deadline needs a confirmed meeting date." }], questions: ["What date does Friday refer to?"] });

test("actual Mastra workflow returns grounded evidence and deterministic table without creating tasks", async () => {
  let calls = 0;
  const result = await runTranscriptActionWorkflow({ transcript, title: "Synthetic launch", sourceReference: "unverified meeting label" }, { extract: async () => { calls++; return extracted(); } });
  assert.equal(calls, 1);
  assert.equal(result.executionKind, "mastra-workflow");
  assert.equal(result.sourceScope, "provided-transcript");
  assert.equal(result.sourceReferenceVerified, false);
  assert.equal(result.items[0].lineStart, 1);
  assert.equal(result.items[0].lineEnd, 1);
  assert.equal(result.items[0].timestamp, "00:01");
  assert.equal(result.items[0].dueText, "by Friday");
  assert.match(result.markdown, /No tasks or messages were created/);
  assert.match(result.markdown, /not independently verified/);
});

test("empty, oversized and malformed transcripts never reach extraction", async () => {
  let calls = 0;
  for (const value of [{ transcript: "" }, { transcript: "Transcript is empty." }, { transcript: "x".repeat(120001) }, { transcript: 123 }, { transcript, secret: "unknown field" }]) {
    await assert.rejects(runTranscriptActionWorkflow(value, { extract: async () => { calls++; return extracted(); } }), /non-empty transcript/);
  }
  assert.equal(calls, 0);
});

test("unsupported quotes are excluded, duplicate evidence is merged and invented owners/deadlines removed", async () => {
  const good = extracted().items[0];
  const result = await runTranscriptActionWorkflow({ transcript }, { extract: async () => ({ items: [good, { ...good, action: "Send the launch plan" }, { ...good, action: "Book flights", evidenceQuote: "I will book the flights today." }, { ...good, action: "Follow up about the plan", owner: "Invented person", dueText: "2027-01-01", evidenceQuote: "Yes, the launch plan will go out by Friday." }], questions: [] }) });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[1].owner, null);
  assert.equal(result.items[1].dueText, null);
  assert.ok(result.warnings.some(x => x.includes("evidence quote")));
  assert.ok(result.warnings.some(x => x.includes("repeated action")));
  assert.equal(result.items[1].lineStart, 3);
});

test("source whitespace is normalized and table cells cannot create HTML or extra columns", async () => {
  const result = await runTranscriptActionWorkflow({ transcript: "[02:03] Casey: I will send\n  the plan | <script> by Friday." }, { extract: async () => ({ items: [{ ...extracted().items[0], action: "Send | <script> `plan`", evidenceQuote: "I will send the plan | <script> by Friday." }], questions: [] }) });
  assert.equal(result.items[0].lineStart, 1);
  assert.equal(result.items[0].lineEnd, 2);
  assert.match(result.markdown, /\\\|/);
  const html = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], children: result.markdown }));
  assert.doesNotMatch(html, /<script>/);
});

test("cancellation stops before extraction and interrupts in-flight analysis", async () => {
  const before = new AbortController(); before.abort();
  let called = false;
  await assert.rejects(runTranscriptActionWorkflow({ transcript }, { signal: before.signal, extract: async () => { called = true; return extracted(); } }), /cancelled/);
  assert.equal(called, false);
  const during = new AbortController();
  const running = runTranscriptActionWorkflow({ transcript }, { signal: during.signal, extract: async () => { during.abort(); return new Promise(() => {}); } });
  await assert.rejects(running, /cancelled/);
});


test("distinct commitments sharing a compound quote are preserved and conflicting dates stay visible", async () => {
  const text = "[00:04] Casey: I will send the plan and book the room by Friday.\n[01:00] Casey: I will send the plan by Monday.";
  const quote = "I will send the plan and book the room by Friday.";
  const result = await runTranscriptActionWorkflow({ transcript: text }, { extract: async () => ({ items: [
    { ...extracted().items[0], action: "Send the plan", evidenceQuote: quote },
    { ...extracted().items[0], action: "Book the room", evidenceQuote: quote },
    { ...extracted().items[0], action: "Send the plan", dueText: "by Monday", evidenceQuote: "I will send the plan by Monday." },
  ], questions: [] }) });
  assert.equal(result.items.length, 3);
  assert.ok(result.warnings.some(x => x.includes("different deadline")));
});

test("derived Markdown renders as inert text even when every field includes image/link syntax", async () => {
  const attack = "![proof](https://example.invalid/proof) [link](https://example.invalid/link)";
  const result = await runTranscriptActionWorkflow({ transcript: `[00:01] Casey: I will send ${attack} by Friday.`, title: attack, sourceReference: attack }, { extract: async () => ({ items: [{ ...extracted().items[0], action: attack, evidenceQuote: `I will send ${attack} by Friday.`, clarification: attack }], questions: [attack] }) });
  const html = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], children: result.markdown }));
  assert.doesNotMatch(html, /<img\b|<a\b|<script\b/i);
});

test("source references retain original leading blank lines", async () => {
  const result = await runTranscriptActionWorkflow({ transcript: `\n\n${transcript}` }, { extract: async () => extracted() });
  assert.equal(result.items[0].lineStart, 3);
  assert.equal(result.items[0].lineEnd, 3);
});

test("an extractor that aborts and rejects has no unhandled rejection", async () => {
  const controller = new AbortController();
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", listener);
  try {
    await assert.rejects(runTranscriptActionWorkflow({ transcript }, { signal: controller.signal, extract: () => { controller.abort(); return Promise.reject(new Error("Synthetic aborted provider")); } }), /cancelled/);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(unhandled.length, 0);
  } finally { process.off("unhandledRejection", listener); }
});
