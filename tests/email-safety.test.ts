import { test } from "node:test";
import assert from "node:assert/strict";
import { MockLanguageModelV3 } from "ai/test";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";
import { executeProtectedComposio, protectHistoricalMessages, sanitizeGmailFetchData, sanitizeComposioMultiResult, validateComposioMailRequest } from "../lib/server/email-safety";
import type { ModelMessage } from "ai";
const otp = "648129";
const credential = "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX";
const mailRequest = {tools:[{tool_slug:"GMAIL_FETCH_EMAILS",arguments:{max_results:5}}]};
const providerResult = {successful:true,data:{total_count:1,success_count:1,error_count:0,session:{instructions:`hidden ${otp}`},results:[{index:0,tool_slug:"GMAIL_FETCH_EMAILS",response:{successful:true,data:{messages:[
  {messageId:"abc123",threadId:"def456",subject:`Your verification code is ${otp}`,messageText:`Code ${otp}`,preview:{subject:`Verification ${otp}`,body:`${otp}`},payload:{raw:`secret ${otp}`}},
  {messageId:"normal123",subject:"Please verify the proposal",sender:"sender@example.test",messageText:"Please review the proposal by Friday.",attachmentList:[{content:`hidden ${credential}`}],payload:{raw:`hidden ${otp}`}},
  {messageId:"api123",subject:"Credentials",messageText:`Bearer ${credential}`},
  {messageId:"encoded123",subject:"Message",messageText:"A".repeat(140)},
  {messageId:"html123",subject:`Your &#118;erification code is ${otp}`,messageText:"Please open the message."},
],resultSizeEstimate:5}}}]}};

test("Gmail content is minimized, recognized authentication messages withheld and normal follow-ups kept", () => {
  const safe = sanitizeComposioMultiResult(providerResult, mailRequest);
  const text = JSON.stringify(safe);
  assert.doesNotMatch(text, new RegExp(otp));
  assert.equal(text.includes(credential), false);
  assert.match(text, /Please review the proposal by Friday/);
  assert.match(text, /Please verify the proposal/);
  assert.match(text, /Sensitive or unsupported message omitted/);
  assert.doesNotMatch(text, /attachmentList|payload|session/);
  assert.equal(providerResult.data.results[0].response.data.messages[0].subject.includes(otp), true);
});
test("unknown formats and unverified email tools fail closed before execution", async () => {
  let calls = 0;
  const unsupported = {tools:[{tool_slug:"GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",arguments:{}}]};
  const result = await executeProtectedComposio(unsupported, async () => { calls++; return providerResult; });
  assert.equal(calls,0);
  assert.match(JSON.stringify(result),/temporarily unavailable/);
  assert.match(validateComposioMailRequest({tools:[{tool_slug:"OUTLOOK_LIST_EMAILS"}]}) || "", /temporarily unavailable/);
  assert.equal(sanitizeGmailFetchData({unexpected:`secret ${otp}`}).ok,false);
  assert.equal(JSON.stringify(sanitizeComposioMultiResult({unexpected:otp},mailRequest)).includes(otp),false);
  assert.equal(JSON.stringify(sanitizeComposioMultiResult(providerResult,{tools:[{tool_slug:"GOOGLECALENDAR_EVENTS_LIST"}]})).includes(otp),false);
});
test("mixed email and calendar results preserve non-email events without leaking hidden email content", () => {
  const input = {tools:[{tool_slug:"GMAIL_FETCH_EMAILS"},{tool_slug:"GOOGLECALENDAR_EVENTS_LIST"}]};
  const result = structuredClone(providerResult);
  result.data.results.push({index:1,tool_slug:"GOOGLECALENDAR_EVENTS_LIST",response:{successful:true,data:{messages:[],resultSizeEstimate:0}}});
  const safe = JSON.stringify(sanitizeComposioMultiResult(result,input));
  assert.match(safe,/GOOGLECALENDAR_EVENTS_LIST/);
  assert.doesNotMatch(safe,new RegExp(otp));
});
test("AI SDK model continuation and saved response only receive the protected result", async () => {
  let calls = 0;
  const usage = {inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:8,text:8,reasoning:0}};
  const model = new MockLanguageModelV3({doGenerate:async () => ++calls === 1 ? {content:[{type:"tool-call",toolCallId:"one",toolName:"read_apps",input:JSON.stringify(mailRequest)}],finishReason:{unified:"tool-calls",raw:"tool_calls"},usage,warnings:[]} : {content:[{type:"text",text:"A proposal needs review."}],finishReason:{unified:"stop",raw:"stop"},usage,warnings:[]}});
  const agent = new ToolLoopAgent({model,tools:{read_apps:tool({inputSchema:z.object({tools:z.array(z.object({tool_slug:z.string(),arguments:z.record(z.string(),z.unknown())}))}),execute:async input => executeProtectedComposio(input,async()=>providerResult)})},stopWhen:stepCountIs(2)});
  const response = await agent.generate({prompt:"Review my inbox"});
  assert.equal(calls,2);
  assert.equal(JSON.stringify(model.doGenerateCalls[1].prompt).includes(otp),false);
  assert.equal(JSON.stringify(response.response.messages).includes(otp),false);
  assert.equal(JSON.stringify(response.steps).includes(credential),false);
  assert.match(JSON.stringify(model.doGenerateCalls[1].prompt),/Please review the proposal/);
});

test("approved tool execution is still filtered before the resumed model and stored messages", async () => {
  let calls = 0;
  const usage = {inputTokens:{total:10,noCache:10,cacheRead:0,cacheWrite:0},outputTokens:{total:8,text:8,reasoning:0}};
  const model = new MockLanguageModelV3({doGenerate:async () => ++calls === 1 ? {content:[{type:"tool-call",toolCallId:"approved-one",toolName:"read_apps",input:JSON.stringify(mailRequest)}],finishReason:{unified:"tool-calls",raw:"tool_calls"},usage,warnings:[]} : {content:[{type:"text",text:"A proposal needs review."}],finishReason:{unified:"stop",raw:"stop"},usage,warnings:[]}});
  const agent = new ToolLoopAgent({model,tools:{read_apps:tool({inputSchema:z.object({tools:z.array(z.object({tool_slug:z.string(),arguments:z.record(z.string(),z.unknown())}))}),needsApproval:true,execute:async input => executeProtectedComposio(input,async()=>providerResult)})},stopWhen:stepCountIs(2)});
  const first = await agent.generate({prompt:"Review my inbox"});
  const approval = first.content.find(part => part.type === "tool-approval-request");
  assert.ok(approval && approval.type === "tool-approval-request");
  const resumed = await agent.generate({messages:[{role:"user",content:"Review my inbox"},...first.response.messages,{role:"tool",content:[{type:"tool-approval-response",approvalId:approval.approvalId,approved:true}]}]});
  assert.equal(calls,2);
  assert.equal(JSON.stringify(model.doGenerateCalls[1].prompt).includes(otp),false);
  assert.equal(JSON.stringify(resumed.response.messages).includes(otp),false);
  assert.match(JSON.stringify(model.doGenerateCalls[1].prompt),/Please review the proposal/);
});

test("historical email results and assistant text are protected on replay without changing stored history", () => {
  const messages: ModelMessage[] = [
    {role:"user",content:"Review my inbox"},
    {role:"assistant",content:[{type:"tool-call",toolCallId:"old",toolName:"COMPOSIO_MULTI_EXECUTE_TOOL",input:mailRequest}]},
    {role:"tool",content:[{type:"tool-result",toolCallId:"old",toolName:"COMPOSIO_MULTI_EXECUTE_TOOL",output:{type:"json",value:providerResult}}]},
    {role:"assistant",content:`Your code is ${otp}`},
  ];
  const protectedMessages = protectHistoricalMessages(messages);
  assert.doesNotMatch(JSON.stringify(protectedMessages),new RegExp(otp));
  assert.match(JSON.stringify(protectedMessages),/Please review the proposal/);
  assert.match(JSON.stringify(messages),new RegExp(otp));
  assert.equal(JSON.stringify(protectHistoricalMessages(protectedMessages)),JSON.stringify(protectedMessages));
  assert.equal(protectedMessages[0].content,"Review my inbox");
  const orphan = protectHistoricalMessages([messages[2]]);
  assert.doesNotMatch(JSON.stringify(orphan),new RegExp(otp));
});
