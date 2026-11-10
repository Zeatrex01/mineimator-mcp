// Drive the live MCP once: launch Mine-imator, open a project, play it, save one screenshot.
// Usage: node live/scripts/open-scene.ts <path.miproject> [if_unsaved]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [path, ifUnsaved] = process.argv.slice(2);
if (!path) throw new Error("usage: open-scene.ts <path.miproject> [if_unsaved]");

const client = new Client({ name: "open-scene", version: "0" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(import.meta.dirname, "..", "src", "main.ts")],
  env: { ...(process.env.MINEIMATOR_HOME ? { MINEIMATOR_HOME: process.env.MINEIMATOR_HOME } : {}) },
}));

type Part = { type: string; text?: string; data?: string };
async function call(name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Part[] };
  const text = r.content.find((c) => c.type === "text")?.text ?? "";
  console.log(`${r.isError ? "ERROR" : "ok"} ${name}: ${text.slice(0, 300)}`);
  return r;
}

try {
  await call("launch");
  const opened = await call("open_project", ifUnsaved ? { path, if_unsaved: ifUnsaved } : { path });
  if (!opened.isError) {
    await call("go_to_start");
    await call("play");
    await new Promise((r) => setTimeout(r, 3000));
    const shot = await call("screenshot");
    const image = shot.content.find((c) => c.type === "image");
    if (image?.data) {
      mkdirSync(join(import.meta.dirname, "..", "out"), { recursive: true });
      const out = join(import.meta.dirname, "..", "out", "open-scene.png");
      writeFileSync(out, Buffer.from(image.data, "base64"));
      console.log(`screenshot: ${out}`);
    }
  }
} finally {
  await client.close();
}
