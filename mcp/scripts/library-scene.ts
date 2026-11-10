// A scene made ONLY from Mine-imator's built-in library, through the MCP tools (this script is an MCP client):
// a chicken, a block, an item, a rolling ball, smoke on the bounce, hearts at the end, two cameras with a cut.
//   MINEIMATOR_HOME=<installed Mine-imator> node scripts/library-scene.ts --out <new.miproject>
// Nothing from anybody's own projects is used: the base is the generic example scene (new_scene keeps only its settings).
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const { values: args } = parseArgs({ options: { out: { type: "string" } } });
if (!args.out) throw new Error("missing --out");
if (!process.env.MINEIMATOR_HOME) throw new Error("set MINEIMATOR_HOME to an installed Mine-imator");

const client = new Client({ name: "library-scene", version: "1" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(import.meta.dirname, "..", "src", "main.ts")],
  env: { MINEIMATOR_HOME: process.env.MINEIMATOR_HOME, ...(process.env.MINEIMATOR_OUTPUT_ROOT ? { MINEIMATOR_OUTPUT_ROOT: process.env.MINEIMATOR_OUTPUT_ROOT } : {}) },
}));

async function tool(name: string, input: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: input })) as { isError?: boolean; content: Array<{ text: string }> };
  const body = JSON.parse(r.content[0].text);
  if (r.isError) throw new Error(`${name}: ${body.error.code}: ${body.error.message}`);
  return body;
}

const opened = await tool("open_project", { path: join(import.meta.dirname, "..", "examples", "generic-scene.miproject"), mode: "new_scene" });
const session_id = opened.session_id as string;
await tool("set_output", { session_id, width: 1080, height: 1920, tempo: 30, length_seconds: 4 });

const chicken = await tool("place_character", { session_id, library: "chicken", name: "Chicken", position: [0, 0, 0] });
await tool("place_prop", { session_id, block: "planks", state: { variant: "oak" }, name: "table", position: [24, 0, 0] });
await tool("place_prop", { session_id, item: "bread", name: "bread", position: [-24, 8, 12], scale: 1.5 });
const ball = await tool("place_prop", { session_id, shape: "sphere", size: 6, color: "#8B4513", name: "meatball", position: [0, 30, 3] });
await tool("animate_path", {
  session_id, timeline_id: ball.root_id, transition: "easeinquad", spin: { axis: "X", degrees_per_unit: 19 },
  points: [{ frame: 0, position: [0, 30, 3] }, { frame: 40, position: [0, 90, 3] }, { frame: 50, position: [0, 105, 3] }],
});
await tool("place_particles", { session_id, preset: "Smoke", position: [0, 90, 3], start_frame: 40, end_frame: 48, amount: 6000 });
await tool("place_particles", { session_id, preset: "Smoke", sprite: "heart", name: "hearts", position: [0, 0, 20], start_frame: 70, end_frame: 100, amount: 1200 });

const close = await tool("set_camera", { session_id, frame: 0, position: [0, -60, 14], rotation: [-4, 0, 0], fov: 40 });
const wide = await tool("set_camera", { session_id, frame: 0, position: [0, -140, 30], rotation: [4, 0, 0], fov: 45 });
await tool("set_shots", { session_id, shots: [{ frame: 0, camera_id: close.camera_id }, { frame: 45, camera_id: wide.camera_id }, { frame: 90, camera_id: close.camera_id }] });
await tool("add_cue", { session_id, seconds: 1.3, label: "boing", kind: "sfx" });

const checked = await tool("validate_project", { session_id });
if (!checked.valid) throw new Error(`validate_project: ${JSON.stringify(checked.errors)}`);
const saved = await tool("save_project", { session_id, path: args.out });
console.log(JSON.stringify({ valid: checked.valid, warnings: checked.warnings.map((w: { code: string }) => w.code), chicken_parts: Object.keys(chicken.part_ids), saved: saved.path, cues: saved.cues_path }));
await client.close();
