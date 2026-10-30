import { test } from "node:test";
import assert from "node:assert/strict";
import { openMCP, validateMCPUrl } from "../lib/server/mcp";
test("MCP credentials cannot redirect into internal networks or ride in endpoint URLs", async () => {
  for (const url of [
    "http://example.com/mcp",
    "https://token:secret@example.com/mcp",
    "https://example.com/mcp?key=secret",
    "https://example.com:8443/mcp",
  ])
    assert.throws(() => validateMCPUrl(url));
  for (const host of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "172.16.0.1",
  ])
    await assert.rejects(
      openMCP(`https://${host}/mcp`),
      /public server address/,
    );
});
