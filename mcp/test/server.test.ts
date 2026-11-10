// End to end: the real server over stdio, driven by a real MCP client, on the generic example project.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { errorsOf, validateProject } from "../src/core/validate/index.ts";
import { parseProject } from "../src/core/project.ts";
import { EXAMPLE_IDS as I, example, makeFakeHome, makePng, tempDir } from "./helpers.ts";

const MAIN = join(import.meta.dirname, "..", "src", "main.ts");

async function connect(env: Record<string, string> = {}) {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [MAIN], env }));
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> };
    const body = JSON.parse(r.content[0].text);
    return { isError: r.isError ?? false, body };
  };
  const ok = async (name: string, args: Record<string, unknown>) => {
    const r = await call(name, args);
    assert.equal(r.isError, false, `${name}: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  return { client, call, ok };
}

const TOOLS = [
  "add_cue", "add_keyframe", "animate_path", "close_project", "export_cues", "give_item", "list_library", "list_templates", "list_timelines", "open_project",
  "place_blocks", "place_character", "place_particles", "place_prop", "place_set", "render", "save_project", "set_camera", "set_output", "set_parent", "set_pose", "set_shots",
  "set_skin", "set_work_camera", "validate_project",
];

test("a whole scene through MCP: new scene, character, skin, poses, camera, output, save, render hand-off", async () => {
  const { dir, cleanup } = tempDir("mi-e2e-");
  const { client, call, ok } = await connect();
  try {
    const srcDir = join(dir, "source");
    mkdirSync(srcDir);
    const source = join(srcDir, "example.miproject");
    writeFileSync(source, JSON.stringify(example()));
    const skin = join(dir, "my-skin.png");
    writeFileSync(skin, makePng(64, 64));

    assert.deepEqual((await client.listTools()).tools.map((t) => t.name).sort(), TOOLS);
    const poseTool = (await client.listTools()).tools.find((t) => t.name === "set_pose")!;
    assert.match(poseTool.description!, /surprised/);

    const opened = await ok("open_project", { path: source, mode: "new_scene" });
    const sid = opened.session_id as string;
    assert.equal(opened.timelines.camera, undefined);
    assert.match(opened.source_sha256, /^[0-9a-f]{64}$/);

    const templates = (await ok("list_templates", { session_id: sid, type: "char" })).templates;
    assert.equal(templates[0].origin, "donor");
    const rootOfRig = templates[0].source_root_ids[0];
    assert.equal(rootOfRig, I.character);

    const donorRows = (await ok("list_timelines", { session_id: sid, from: "donor" })).timelines as Array<{ id: string }>;
    assert.ok(donorRows.some((t) => t.id === I.props), "the donor can be listed to find sets");
    assert.equal((await ok("list_timelines", { session_id: sid })).timelines.length, 0, "the new scene itself is empty");

    await ok("place_set", { session_id: sid, source_root_id: I.props });
    const placed = await ok("place_character", { session_id: sid, source_root_id: rootOfRig, name: "Hero", position: [0, 0, 0] });
    const hero = placed.root_id as string;
    await ok("set_skin", { session_id: sid, root_id: hero, path: skin });
    await ok("set_pose", { session_id: sid, root_id: hero, frame: 0, pose: "neutral" });
    await ok("set_pose", { session_id: sid, root_id: hero, frame: 30, pose: "surprised" });
    await ok("add_keyframe", { session_id: sid, timeline_id: hero, frame: 20, values: { POS_Z: -2, TRANSITION: "easeoutback" } });
    const cam = await ok("set_camera", { session_id: sid, frame: 0, position: [0, -120, 24], rotation: [3, 0, 0], fov: 28, activate: true });
    await ok("set_camera", { session_id: sid, camera_id: cam.camera_id, frame: 40, position: [0, -60, 24], rotation: [3, 0, 0] });
    const out = await ok("set_output", { session_id: sid, width: 1080, height: 1920, tempo: 30, length_seconds: 5 });
    assert.equal(out.region_end, 150);
    assert.ok(out.revision >= 9);

    const checked = await ok("validate_project", { session_id: sid });
    assert.equal(checked.valid, true);
    assert.deepEqual(checked.asset_manifest.map((a: { filename: string; status: string }) => [a.filename, a.status]), [["my-skin.png", "staged"]]);

    // render before saving is refused with a stable code
    const early = await call("render", { session_id: sid });
    assert.equal(early.isError, true);
    assert.equal(early.body.error.code, "PROJECT_NOT_SAVED");
    assert.equal(early.body.changed, false);

    const target = join(dir, "out", "scene.miproject");
    const saved = await ok("save_project", { session_id: sid, path: target });
    assert.equal(saved.path, target);
    assert.match(saved.sha256, /^[0-9a-f]{64}$/);
    assert.ok(existsSync(join(dir, "out", "my-skin.png")), "the skin is copied next to the project");
    const written = parseProject(readFileSync(target, "utf8"));
    assert.deepEqual(errorsOf(validateProject(written)), []);
    assert.equal(written.project.video_width, 1080);
    assert.equal(written.timelines.filter((t) => t.type === "camera" && t.hide === false).length, 1);
    assert.deepEqual(JSON.parse(readFileSync(source, "utf8")), example(), "the source file is untouched");

    const again = await call("save_project", { session_id: sid, path: target });
    assert.equal(again.body.error.code, "DEST_EXISTS");

    const render = await ok("render", { session_id: sid });
    assert.equal(render.status, "manual_required");
    assert.equal(render.project_path, target);
    assert.deepEqual(render.settings, { width: 1080, height: 1920, tempo: 30, length_frames: 150 });
    assert.match(render.instructions.join(" "), /Export movie/);

    assert.deepEqual(await ok("close_project", { session_id: sid }), { closed: true });
    const stale = await call("list_timelines", { session_id: sid });
    assert.equal(stale.body.error.code, "SESSION_NOT_FOUND");
  } finally {
    await client.close();
    cleanup();
  }
});

test("a failed edit changes nothing and the error has a stable code, pointer and changed:false", async () => {
  const { dir, cleanup } = tempDir("mi-e2e-");
  const { client, call, ok } = await connect();
  try {
    const source = join(dir, "example.miproject");
    writeFileSync(source, JSON.stringify(example()));
    const sid = (await ok("open_project", { path: source })).session_id as string;
    const before = await ok("list_timelines", { session_id: sid });

    const noDonor = await call("list_timelines", { session_id: sid, from: "donor" });
    assert.equal(noDonor.body.error.code, "INVALID_VALUE");

    const bad = await call("add_keyframe", { session_id: sid, timeline_id: I.rightArm, frame: 3, values: { BEND_ANGLE_Y: 4 } });
    assert.equal(bad.isError, true);
    assert.equal(bad.body.error.code, "UNSUPPORTED_BEND");
    assert.equal(bad.body.changed, false);

    const missing = await call("place_character", { session_id: sid, source_root_id: "NOPE", name: "x", position: [0, 0, 0] });
    assert.equal(missing.body.error.code, "ID_NOT_FOUND");

    const png = await call("set_skin", { session_id: sid, root_id: I.character, path: source });
    assert.equal(png.body.error.code, "INVALID_PNG");

    const after = await ok("list_timelines", { session_id: sid });
    assert.deepEqual(after.timelines, before.timelines);
    assert.equal(after.revision, before.revision, "no revision was spent on failed edits");

    const schema = await client.callTool({ name: "set_output", arguments: { session_id: sid, width: "wide" } });
    assert.equal((schema as { isError?: boolean }).isError, true, "bad argument types are rejected by the schema");
  } finally {
    await client.close();
    cleanup();
  }
});

test("a missing resource file blocks the save; the output root keeps writes inside it", async () => {
  const { dir, cleanup } = tempDir("mi-e2e-");
  const root = join(dir, "allowed");
  mkdirSync(root);
  const { client, call, ok } = await connect({ MINEIMATOR_OUTPUT_ROOT: root });
  try {
    const project = example();
    project.resources.push({ id: "RESOURCE00000001", type: "texture", filename: "not-there.png" });
    const source = join(dir, "example.miproject");
    writeFileSync(source, JSON.stringify(project));
    const sid = (await ok("open_project", { path: source })).session_id as string;

    const outside = await call("save_project", { session_id: sid, path: join(dir, "elsewhere", "a.miproject") });
    assert.equal(outside.body.error.code, "DEST_NOT_ALLOWED");
    const missing = await call("save_project", { session_id: sid, path: join(root, "a.miproject") });
    assert.equal(missing.body.error.code, "MISSING_ASSET");
    assert.equal(existsSync(join(root, "a.miproject")), false);
  } finally {
    await client.close();
    cleanup();
  }
});

// ---- built-in library through MCP ------------------------------------------------------------------------------

async function libraryScene(home: string, names: { mob: string; block: string; item: string; preset: string; sprite: string }) {
  const { dir, cleanup } = tempDir("mi-e2e-");
  const { client, call, ok } = await connect({ MINEIMATOR_HOME: home });
  try {
    const source = join(dir, "example.miproject");
    writeFileSync(source, JSON.stringify(example()));
    const sid = (await ok("open_project", { path: source, mode: "new_scene" })).session_id as string;

    const summary = await ok("list_library", {});
    assert.ok(summary.characters.includes(names.mob), `${names.mob} is a library character`);
    assert.ok(summary.particle_presets.includes(names.preset));
    const items = await ok("list_library", { kind: "items", search: names.item });
    assert.ok(items.rows.some((r: { name: string }) => r.name === `item/${names.item}`));

    const mob = await ok("place_character", { session_id: sid, library: names.mob, name: "Mob", position: [0, 0, 0] });
    assert.ok(Object.keys(mob.part_ids).length >= 3);
    await ok("place_prop", { session_id: sid, block: names.block, position: [32, 0, 0] });
    await ok("place_prop", { session_id: sid, item: names.item, name: "snack", position: [0, 20, 8] });
    const ball = await ok("place_prop", { session_id: sid, shape: "sphere", size: 6, color: "#8B4513", position: [0, 10, 3] });
    await ok("add_keyframe", { session_id: sid, timeline_id: ball.root_id, frame: 0, values: { POS_X: 0, POS_Y: 10, POS_Z: 3, TRANSITION: "easeoutback" } });
    const fx = await ok("place_particles", { session_id: sid, preset: names.preset, sprite: names.sprite, position: [0, 10, 3], start_frame: 10, end_frame: 20 });
    assert.equal(fx.keys.length, 3);
    await ok("set_camera", { session_id: sid, frame: 0, position: [0, -120, 24], rotation: [3, 0, 0], activate: true });
    await ok("set_output", { session_id: sid, width: 1080, height: 1920, tempo: 30, length_seconds: 2 });

    const checked = await ok("validate_project", { session_id: sid });
    assert.equal(checked.valid, true, JSON.stringify(checked.errors));
    assert.deepEqual(checked.asset_manifest, [], "built-in objects need no resource files");

    const target = join(dir, "out", "library.miproject");
    await ok("save_project", { session_id: sid, path: target });
    const written = parseProject(readFileSync(target, "utf8"));
    assert.deepEqual(errorsOf(validateProject(written)), []);
    assert.deepEqual([...new Set(written.templates.map((t) => t.type))].sort(), ["block", "item", "particles", "sphere", "char"].sort());

    assert.equal((await call("place_character", { session_id: sid, library: "nope", name: "x", position: [0, 0, 0] })).body.error.code, "LIBRARY_ENTRY_NOT_FOUND");
    assert.equal((await call("place_character", { session_id: sid, name: "x", position: [0, 0, 0] })).body.error.code, "INVALID_VALUE");
    assert.equal((await call("place_particles", { session_id: sid, preset: "nope" })).body.error.code, "LIBRARY_ENTRY_NOT_FOUND");
  } finally {
    await client.close();
    cleanup();
  }
}

test("built-in library through MCP: a made-up install", async () => {
  const { dir, cleanup } = tempDir("mi-home-");
  try {
    await libraryScene(makeFakeHome(dir), { mob: "hen", block: "planks", item: "bread", preset: "Puff", sprite: "heart" });
  } finally {
    cleanup();
  }
});

test("built-in library through MCP: without MINEIMATOR_HOME the tools say so", async () => {
  const { dir, cleanup } = tempDir("mi-e2e-");
  const { client, call, ok } = await connect({ MINEIMATOR_HOME: "" });
  try {
    const source = join(dir, "example.miproject");
    writeFileSync(source, JSON.stringify(example()));
    const sid = (await ok("open_project", { path: source, mode: "new_scene" })).session_id as string;
    assert.equal((await call("list_library", {})).body.error.code, "LIBRARY_NOT_CONFIGURED");
    assert.equal((await call("place_character", { session_id: sid, library: "chicken", name: "x", position: [0, 0, 0] })).body.error.code, "LIBRARY_NOT_CONFIGURED");
    assert.equal((await call("place_prop", { session_id: sid, block: "stone" })).body.error.code, "LIBRARY_NOT_CONFIGURED");
    assert.equal((await ok("place_prop", { session_id: sid, shape: "cube" })).source, "library", "shapes need no install");
  } finally {
    await client.close();
    cleanup();
  }
});

const REAL_HOME = process.env.MINEIMATOR_HOME;
test("built-in library through MCP: a real install (chicken, block, item, particles)", { skip: !(REAL_HOME && existsSync(join(REAL_HOME, "Data"))) && "set MINEIMATOR_HOME" }, async () => {
  await libraryScene(REAL_HOME!, { mob: "chicken", block: "planks", item: "bread", preset: "Smoke", sprite: "heart" });
});
