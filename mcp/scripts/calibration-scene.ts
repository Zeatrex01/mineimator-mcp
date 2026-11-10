// A calibration scene: library blocks, items, mobs and particles on a measured grid, each with a small red marker cube
// at the requested position, so a screenshot shows where the object really sits relative to what was asked.
//   MINEIMATOR_HOME=<installed Mine-imator> node scripts/calibration-scene.ts --out <new.miproject> [--view top|front|side] [--mode fixed|raw]  (raw: the old place_prop calls at 32i; fixed: place_blocks cells and give_item)
// Layout (scene units, 16 = one block; X right, Y away from a front viewer, Z up):
//   row A  y=0    blocks   x = 0, 32, 64...   stone, planks, log, leaves, glass, stairs, slab
//   row B  y=48   items    x = 0, 32, 64...   bread, cake, cooked_beef, apple, diamond_sword
//   row C  y=96   mobs     x = 0, 40, 80, 120 chicken, zombie, villager, human
//   row D  y=150  particles x = 0, 48         Smoke, heart sprite
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const { values: args } = parseArgs({
  options: { out: { type: "string" }, mode: { type: "string", default: "fixed" }, view: { type: "string", default: "front" }, axy: { type: "string" }, az: { type: "string" }, zoom: { type: "string" }, focus: { type: "string" } },
});
if (!args.out) throw new Error("missing --out");
if (!process.env.MINEIMATOR_HOME) throw new Error("set MINEIMATOR_HOME to an installed Mine-imator");

const client = new Client({ name: "calibration-scene", version: "1" });
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

const marker = (name: string, x: number, y: number, z: number) =>
  tool("place_prop", { session_id, shape: "cube", size: 2, color: "#FF0000", name: `mark_${name}`, position: [x, y, z] });

const blocks: Array<[string, Record<string, string> | undefined]> = [
  ["stone", undefined], ["planks", { variant: "oak" }], ["log", { variant: "oak", axis: "y" }], ["leaves", { variant: "oak" }],
  ["glass", undefined], ["stairs", { variant: "oak", facing: "east", half: "bottom" }], ["slab", { variant: "oak", type: "bottom" }],
];
for (const [i, [block, state]] of blocks.entries()) {
  if (args.mode === "raw") {
    await tool("place_prop", { session_id, block, state, name: block, position: [i * 32, 0, 0] });
    await marker(`block_${block}`, i * 32, 0, 0);
  } else {
    // place_blocks: cell [2i, 0, 0] has its minimum corner at [32i, 0, 0] (the red marker); the block fills 16 units from there
    await tool("place_blocks", { session_id, name: block, entries: [{ kind: "single", block, state, from: [i * 2, 0, 0] }] });
    await marker(`corner_${block}`, i * 32, 0, 0);
  }
}
for (const [i, item] of ["bread", "cake", "cooked_beef", "apple", "diamond_sword"].entries()) {
  await tool("place_prop", { session_id, item, name: item, position: [i * 32, 48, 0] });
  await marker(`item_${item}`, i * 32, 48, 0);
}
for (const [i, library] of ["chicken", "zombie", "villager", "human"].entries()) {
  const mob = await tool("place_character", { session_id, library, name: library, position: [i * 40, 96, 0] });
  if (library === "human" && args.mode !== "raw") await tool("give_item", { session_id, character_id: mob.root_id, hand: "right", item: "bread" });
  await marker(`mob_${library}`, i * 40, 96, 0);
}
await tool("place_particles", { session_id, preset: "Smoke", name: "smoke", position: [0, 150, 0], start_frame: 0, end_frame: 100, amount: 6000 });
await tool("place_particles", { session_id, preset: "Smoke", sprite: "heart", name: "hearts", position: [48, 150, 0], start_frame: 0, end_frame: 100, amount: 1200 });
await marker("smoke", 0, 150, 0);
await marker("hearts", 48, 150, 0);

const views: Record<string, [number, number, number, number]> = { // angle_xy, angle_z, zoom ... calibrated, see README
  top: [0, 90, 330, 0], front: [0, 0, 330, 0], side: [90, 0, 330, 0],
};
const [axy, az, zoom] = views[args.view!] ?? views.front;
const focus = args.focus ? (args.focus.split(",").map(Number) as [number, number, number]) : [96, 75, 0] as [number, number, number];
await tool("set_work_camera", {
  session_id, focus, angle_xy: args.axy ? Number(args.axy) : axy, angle_z: args.az ? Number(args.az) : az, zoom: args.zoom ? Number(args.zoom) : zoom,
});
const checked = await tool("validate_project", { session_id });
if (!checked.valid) throw new Error(`validate_project: ${JSON.stringify(checked.errors)}`);
const saved = await tool("save_project", { session_id, path: args.out });
console.log(JSON.stringify({ saved: saved.path }));
await client.close();
