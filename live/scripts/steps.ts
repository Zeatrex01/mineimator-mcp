// Run a list of live MCP tool calls in one server session; screenshots are saved as live/out/step-<n>.png.
// Usage: node live/scripts/steps.ts '[["screenshot"],["click",{"x":60,"y":40,"space":"screenshot"}],["wait",800],["screenshot"]]'
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const steps = JSON.parse(process.argv[2] ?? "[]") as Array<[string, (Record<string, unknown> | number)?]>;
const client = new Client({ name: "steps", version: "0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(import.meta.dirname, "..", "src", "main.ts")], env: { ...(process.env.MINEIMATOR_HOME ? { MINEIMATOR_HOME: process.env.MINEIMATOR_HOME } : {}) } }));

type Part = { type: string; text?: string; data?: string };
try {
  for (const [i, [name, arg]] of steps.entries()) {
    if (name === "wait") {
      await new Promise((r) => setTimeout(r, Number(arg ?? 500)));
      continue;
    }
    const r = (await client.callTool({ name, arguments: (arg as Record<string, unknown>) ?? {} })) as { isError?: boolean; content: Part[] };
    const text = r.content.find((c) => c.type === "text")?.text ?? "";
    console.log(`${i} ${r.isError ? "ERROR" : "ok"} ${name}: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
    const image = r.content.find((c) => c.type === "image");
    if (image?.data) {
      mkdirSync(join(import.meta.dirname, "..", "out"), { recursive: true });
      const out = join(import.meta.dirname, "..", "out", `step-${i}.png`);
      writeFileSync(out, Buffer.from(image.data, "base64"));
      console.log(`  saved ${out}`);
    }
  }
} finally {
  await client.close();
}
