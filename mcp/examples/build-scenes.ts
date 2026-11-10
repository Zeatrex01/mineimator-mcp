// Three example scenes built ONLY from Mine-imator's own library (the default human, library blocks, items and particles),
// through the MCP tools (this script is an MCP client). Each has a small block-built set, one camera and a short cycle:
//   walk-cycle   4 s   the human walks along a grass strip with a sword in the right hand
//   run-cycle    3 s   the human runs, faster strides, leaning forward
//   jump         3 s   crouch, jump with sparkles, land with a puff of dust
//   MINEIMATOR_HOME=<installed Mine-imator> node examples/build-scenes.ts [--out examples/scenes] [--only walk-cycle] [--marker 25]
// Nothing from anybody's own projects is used: the base is the generic example scene (new_scene keeps only its settings).
// Placement facts used here (README, "Placement"): a block or character is centred on its position in X and Y with its bottom at
// the position's Z; a block cell [i,j,k] occupies 16 units from its minimum corner; a character faces +Y at rotation 0.
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const { values: args } = parseArgs({ options: { out: { type: "string", default: join(import.meta.dirname, "scenes") }, only: { type: "string" }, "work-camera": { type: "string" }, marker: { type: "string" } } });
if (!process.env.MINEIMATOR_HOME) throw new Error("set MINEIMATOR_HOME to an installed Mine-imator");
const out = resolve(args.out!);
mkdirSync(out, { recursive: true });

const client = new Client({ name: "build-scenes", version: "1" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(import.meta.dirname, "..", "src", "main.ts")],
  env: { MINEIMATOR_HOME: process.env.MINEIMATOR_HOME, MINEIMATOR_OUTPUT_ROOT: out },
}));
async function tool(name: string, input: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: input })) as { isError?: boolean; content: Array<{ text: string }> };
  const body = JSON.parse(r.content[0].text);
  if (r.isError) throw new Error(`${name}: ${body.error.code}: ${body.error.message}`);
  return body;
}

type V3 = [number, number, number];
const FLOOR_TOP = 16; // the grass strip is one block thick: everything stands at z = 16

/** A small outdoor set: a grass strip `length` blocks long, a cobblestone wall behind it, a tree at the far end. */
async function buildSet(session_id: string, length: number) {
  await tool("place_blocks", {
    session_id, name: "set",
    entries: [
      { kind: "box", block: "grass_block", from: [-1, -2, 0], to: [length, 3, 0] },
      { kind: "box", block: "cobblestone", from: [-1, 4, 0], to: [length, 4, 1] },
      { kind: "line", block: "stone_bricks", state: { variant: "mossy" }, from: [-1, 4, 2], to: [length, 4, 2] },
      { kind: "line", block: "log", state: { variant: "oak", axis: "y" }, from: [length - 2, 2, 1], to: [length - 2, 2, 4] },
      { kind: "box", block: "leaves", state: { variant: "oak" }, from: [length - 4, 0, 5], to: [length, 4, 7] },
    ],
  });
}

async function newScene(seconds: number) {
  const opened = await tool("open_project", { path: join(import.meta.dirname, "generic-scene.miproject"), mode: "new_scene" });
  const session_id = opened.session_id as string;
  await tool("set_output", { session_id, width: 1280, height: 720, tempo: 30, length_seconds: seconds });
  return session_id;
}

/** A camera key plus the matching free viewport camera (so a live screenshot shows what the scene camera sees). */
async function frame(session_id: string, position: V3, rotation: V3, fov: number, lookAt: V3, distance: number, side = 90) {
  const cam = await tool("set_camera", { session_id, frame: 0, position, rotation, fov, activate: true });
  const wc = args["work-camera"]?.split(",").map(Number);
  await tool("set_work_camera", { session_id, focus: lookAt, angle_xy: wc?.[0] ?? side, angle_z: wc?.[1] ?? 12, zoom: wc?.[2] ?? distance, ...(args.marker ? { frame: Number(args.marker) } : {}) });
  return cam.camera_id as string;
}

async function save(session_id: string, name: string) {
  const checked = await tool("validate_project", { session_id });
  if (!checked.valid) throw new Error(`${name}: ${JSON.stringify(checked.errors)}`);
  const path = join(out, `${name}.miproject`);
  if (existsSync(path)) throw new Error(`${path} exists; remove it first (save never overwrites)`);
  await tool("save_project", { session_id, path });
  console.log(`saved ${path}`);
}

/** Alternate two poses every `half` frames from 0 to `end`, ending on the first one. */
async function cycle(session_id: string, root_id: string, a: string, b: string, half: number, end: number) {
  for (let f = 0, n = 0; f <= end; f += half, n++) await tool("set_pose", { session_id, root_id, frame: f, pose: n % 2 === 0 ? a : b });
}

const wanted = (n: string) => !args.only || args.only === n;

// ---------------------------------------------------------------------------------------------------------- walk
if (wanted("walk-cycle")) {
  const sid = await newScene(4);
  await buildSet(sid, 11);
  const hero = await tool("place_character", { session_id: sid, library: "human", name: "walker", position: [24, 24, FLOOR_TOP], rotation_z: 90 });
  await tool("give_item", { session_id: sid, character_id: hero.root_id, hand: "right", item: "diamond_sword" });
  await cycle(sid, hero.root_id, "walk_a", "walk_b", 10, 120);
  // 12 half-steps of 12 units; ROT_Z is repeated in both keys because a key resets what it leaves out
  await tool("add_keyframe", { session_id: sid, timeline_id: hero.root_id, frame: 0, values: { POS_X: 24, POS_Y: 24, POS_Z: FLOOR_TOP, ROT_Z: 90, TRANSITION: "linear" } });
  await tool("add_keyframe", { session_id: sid, timeline_id: hero.root_id, frame: 120, values: { POS_X: 168, POS_Y: 24, POS_Z: FLOOR_TOP, ROT_Z: 90 } });
  await frame(sid, [96, -150, 52], [8, 0, 0], 40, [96, 24, 36], 175);
  await save(sid, "walk-cycle");
}

// ---------------------------------------------------------------------------------------------------------- run
if (wanted("run-cycle")) {
  const sid = await newScene(3);
  await buildSet(sid, 17);
  const hero = await tool("place_character", { session_id: sid, library: "human", name: "runner", position: [24, 24, FLOOR_TOP], rotation_z: 90 });
  await cycle(sid, hero.root_id, "run_a", "run_b", 6, 90);
  // 15 half-steps of 20 units; a small bob up and down with every step would need more keys: kept flat on purpose
  await tool("add_keyframe", { session_id: sid, timeline_id: hero.root_id, frame: 0, values: { POS_X: 24, POS_Y: 24, POS_Z: FLOOR_TOP, ROT_Z: 90, TRANSITION: "linear" } });
  await tool("add_keyframe", { session_id: sid, timeline_id: hero.root_id, frame: 90, values: { POS_X: 324, POS_Y: 24, POS_Z: FLOOR_TOP, ROT_Z: 90 } });
  await frame(sid, [144, -250, 70], [8, 0, 0], 45, [144, 24, 36], 290);
  await save(sid, "run-cycle");
}

// ---------------------------------------------------------------------------------------------------------- jump
if (wanted("jump")) {
  const sid = await newScene(3);
  await buildSet(sid, 8);
  const at: V3 = [64, 24, FLOOR_TOP];
  const hero = await tool("place_character", { session_id: sid, library: "human", name: "jumper", position: at, rotation_z: 180 });
  const root = hero.root_id as string;
  const rest = { POS_X: at[0], POS_Y: at[1], ROT_Z: 180 };
  await tool("set_pose", { session_id: sid, root_id: root, frame: 0, pose: "neutral" });
  await tool("set_pose", { session_id: sid, root_id: root, frame: 20, pose: "jump_crouch" });
  await tool("set_pose", { session_id: sid, root_id: root, frame: 30, pose: "jump_air" });
  await tool("set_pose", { session_id: sid, root_id: root, frame: 48, pose: "jump_land" });
  await tool("set_pose", { session_id: sid, root_id: root, frame: 64, pose: "neutral" });
  // the root: hold, rise to a 28-unit apex, fall, settle (a key leaves out nothing it needs: POS_X/Y and ROT_Z are repeated; the character is turned 180 degrees to face -Y, toward this camera)
  await tool("add_keyframe", { session_id: sid, timeline_id: root, frame: 0, values: { ...rest, POS_Z: FLOOR_TOP } });
  await tool("add_keyframe", { session_id: sid, timeline_id: root, frame: 20, values: { ...rest, POS_Z: FLOOR_TOP - 3, TRANSITION: "easeoutquad" } });
  await tool("add_keyframe", { session_id: sid, timeline_id: root, frame: 34, values: { ...rest, POS_Z: FLOOR_TOP + 28, TRANSITION: "easeinquad" } });
  await tool("add_keyframe", { session_id: sid, timeline_id: root, frame: 48, values: { ...rest, POS_Z: FLOOR_TOP } });
  await tool("add_keyframe", { session_id: sid, timeline_id: root, frame: 64, values: { ...rest, POS_Z: FLOOR_TOP } });
  await tool("place_particles", { session_id: sid, preset: "firework_blast", name: "sparkles", position: [at[0], at[1], FLOOR_TOP + 40], start_frame: 34 }); // a burst: fires once at the apex
  await tool("place_particles", { session_id: sid, preset: "Smoke", name: "landing_dust", position: [at[0], at[1], FLOOR_TOP + 1], start_frame: 48, end_frame: 54, amount: 12000 });
  await frame(sid, [64, -120, 52], [8, 0, 0], 40, [64, 24, 36], 150);
  await save(sid, "jump");
}

await client.close();
