// The real server over stdio with a real MCP client. Only calls that need no Mine-imator window are made.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const MAIN = join(import.meta.dirname, "..", "src", "main.ts");

test("the server lists the nine tools and refuses bad arguments before touching the OS", async () => {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [MAIN] }));
  try {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["click", "focus", "go_to_start", "launch", "open_project", "pause", "play", "press", "screenshot"]);

    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> };
      return { isError: r.isError ?? false, body: JSON.parse(r.content[0].text) };
    };
    const badKeys = await call("press", { keys: "alt+f4" });
    assert.equal(badKeys.isError, true);
    assert.equal(badKeys.body.error.code, "BLOCKED_KEYS");
    assert.equal(typeof badKeys.body.ms, "number");

    const badPath = await call("open_project", { path: "scene.txt" });
    assert.equal(badPath.body.error.code, "BAD_PATH");

    const missing = await call("open_project", { path: "C:\\definitely\\not\\here.miproject" });
    assert.equal(missing.body.error.code, "NOT_FOUND");
  } finally {
    await client.close();
  }
});
