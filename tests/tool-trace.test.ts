import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileToolTrace } from "../lib/server/tool-trace";
const result = (toolName: string, toolCallId: string, value: unknown) => ({role:"tool",content:[{type:"tool-result",toolName,toolCallId,output:{type:"json",value}}]});
test("approval-resumed tool results resolve the matching trace without exposing output", () => {
  const trace = [{tool:"read",status:"running",toolCallId:"a"},{tool:"read",status:"running",toolCallId:"b"}];
  const resolved = reconcileToolTrace(trace,[result("read","b",{successful:true, private:"not copied"})]);
  assert.equal(resolved[0].status,"running");
  assert.equal(resolved[1].status,"completed");
  assert.equal(resolved[1].output,undefined);
  assert.equal(trace[1].status,"running");
});
test("legacy trace is reconciled only when matching is unambiguous", () => {
  const messages = [{role:"assistant",content:[{type:"tool-call",toolName:"read",toolCallId:"a"}]},result("read","a",{successful:true})];
  assert.equal(reconcileToolTrace([{tool:"read",status:"running"}],messages)[0].status,"completed");
  assert.deepEqual(reconcileToolTrace([{tool:"read",status:"running"},{tool:"read",status:"running"}],messages).map(t=>t.status),["running","running"]);
  assert.equal(reconcileToolTrace([{tool:"read",status:"running"}],[...messages,{role:"assistant",content:[{type:"tool-call",toolName:"read",toolCallId:"later"}]}])[0].status,"running");
});
test("failed and partially failed tool results are not reported as complete", () => {
  const trace = [{tool:"read",status:"running",toolCallId:"a"},{tool:"other",status:"running",toolCallId:"b"}];
  const resolved = reconcileToolTrace(trace,[result("read","a",{successful:false}),result("other","b",{successful:true,data:{error_count:1}})]);
  assert.deepEqual(resolved.map(t=>t.status),["failed","partial"]);
});
test("a denied approval resolves the corresponding pending trace", () => {
  const messages = [{role:"assistant",content:[{type:"tool-call",toolName:"read",toolCallId:"a"},{type:"tool-approval-request",approvalId:"approval",toolCallId:"a"}]},{role:"tool",content:[{type:"tool-approval-response",approvalId:"approval",approved:false}]}];
  assert.equal(reconcileToolTrace([{tool:"read",status:"running",toolCallId:"a"}],messages)[0].status,"denied");
});
