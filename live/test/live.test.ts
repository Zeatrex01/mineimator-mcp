// OPT-IN live test: MINEIMATOR_LIVE=1. It opens Mine-imator on screen, opens the walk-cycle example scene, plays, takes ONE
// screenshot (out/check.png), pauses and goes to the start. It leaves Mine-imator open. Timings go to out/live-report.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const MAIN = join(import.meta.dirname, "..", "src", "main.ts");
const OUT = join(import.meta.dirname, "..", "out");
const PROJECT = process.env.MINEIMATOR_TEST_PROJECT ?? join(import.meta.dirname, "..", "..", "mcp", "examples", "scenes", "walk-cycle.miproject");

type Content = Array<{ type: string; text?: string; data?: string }>;

test("live: launch, focus, open project, play, screenshot, pause, go to start", { skip: process.env.MINEIMATOR_LIVE !== "1", timeout: 240_000 }, async () => {
  mkdirSync(OUT, { recursive: true });
  const client = new Client({ name: "live-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [MAIN] }));
  const report: Record<string, unknown> = {};
  const run = async (name: string, args: Record<string, unknown> = {}) => {
    const t0 = Date.now();
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Content };
    const body = JSON.parse(r.content[0].text as string);
    report[name] = { wall_ms: Date.now() - t0, isError: r.isError ?? false, ...body };
    writeFileSync(join(OUT, "live-report.json"), JSON.stringify(report, null, 1)); // kept up to date if a later step fails
    return { r, body };
  };
  try {
    assert.equal((await run("launch")).body.ok, true);
    assert.equal((await run("focus")).body.ok, true);
    const open = await run("open_project", { path: PROJECT });
    assert.equal(open.body.ok, true, JSON.stringify(open.body));
    await run("play");
    const shot = await run("screenshot");
    const image = shot.r.content.find((c) => c.type === "image");
    assert.ok(image?.data, "screenshot returned no image");
    writeFileSync(join(OUT, "check.png"), Buffer.from(image.data, "base64"));
    await run("pause");
    await run("go_to_start");
    assert.equal((report.open_project as { confirmed?: boolean }).confirmed, true, "project open was not confirmed by the window title");
  } finally {
    await client.close(); // stops the helper; Mine-imator stays open
  }
});
