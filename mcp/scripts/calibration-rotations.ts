// Rotation calibration: stairs in four facings, logs in three axes, a bread item and a zombie at ROT_Z 0/90/180/270,
// each with a red marker at the requested position. Look at it from above to read what each setting does.
//   MINEIMATOR_HOME=<install> node scripts/calibration-rotations.ts --out <new.miproject>
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const { values: args } = parseArgs({ options: { out: { type: "string" }, axy: { type: "string", default: "90" }, az: { type: "string", default: "89.9" }, zoom: { type: "string", default: "230" } } });
if (!args.out) throw new Error("missing --out");
const client = new Client({ name: "calibration-rotations", version: "1" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(import.meta.dirname, "..", "src", "main.ts")], env: { MINEIMATOR_HOME: process.env.MINEIMATOR_HOME ?? "" } }));
async function tool(name: string, input: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: input })) as { isError?: boolean; content: Array<{ text: string }> };
  const body = JSON.parse(r.content[0].text);
  if (r.isError) throw new Error(`${name}: ${body.error.code}: ${body.error.message}`);
  return body;
}
const opened = await tool("open_project", { path: join(import.meta.dirname, "..", "examples", "generic-scene.miproject"), mode: "new_scene" });
const session_id = opened.session_id as string;
const mark = (x: number, y: number) => tool("place_prop", { session_id, shape: "cube", size: 2, color: "#FF0000", name: "mark", position: [x, y, 0] });

for (const [i, facing] of ["north", "south", "east", "west"].entries()) {
  await tool("place_prop", { session_id, block: "stairs", state: { variant: "oak", facing }, name: `stairs_${facing}`, position: [i * 32, 0, 0] });
  await mark(i * 32, 0);
}
for (const [i, axis] of ["x", "y", "z"].entries()) {
  await tool("place_prop", { session_id, block: "log", state: { variant: "oak", axis }, name: `log_${axis}`, position: [i * 32, 32, 0] });
  await mark(i * 32, 32);
}
for (const [i, rot] of [0, 90, 180, 270].entries()) {
  await tool("place_prop", { session_id, item: "diamond_sword", name: `sword_${rot}`, position: [i * 32, 64, 0], rotation: [0, 0, rot] });
  await mark(i * 32, 64);
  const z = await tool("place_character", { session_id, library: "zombie", name: `zombie_${rot}`, position: [i * 32, 100, 0] });
  await tool("add_keyframe", { session_id, timeline_id: z.root_id, frame: 0, values: { POS_X: i * 32, POS_Y: 100, POS_Z: 0, ROT_Z: rot } });
  await mark(i * 32, 100);
}
await tool("set_work_camera", { session_id, focus: [48, 50, 0], angle_xy: Number(args.axy), angle_z: Number(args.az), zoom: Number(args.zoom) });
const saved = await tool("save_project", { session_id, path: args.out });
console.log(saved.path);
await client.close();
