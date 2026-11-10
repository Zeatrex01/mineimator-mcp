// What a longer scene needs on top of the basics: camera cuts, moving props, the new poses and cues.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MineimatorError } from "../src/core/errors.ts";
import type { Project } from "../src/core/project.ts";
import { errorsOf, validateProject } from "../src/core/validate/index.ts";
import { addKeyframe } from "../src/ops/addKeyframe.ts";
import { animatePath } from "../src/ops/animatePath.ts";
import { addCue, cuesDocument, type Cue } from "../src/ops/cues.ts";
import { placeProp } from "../src/ops/placeProp.ts";
import { setCamera } from "../src/ops/setCamera.ts";
import { setPose } from "../src/ops/setPose.ts";
import { setShots } from "../src/ops/setShots.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EXAMPLE_IDS as I, example, libraries, makeFakeHome, tempDir } from "./helpers.ts";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as MineimatorError).code;
  }
  return undefined;
};
const valid = (p: Project) => assert.deepEqual(errorsOf(validateProject(p)), []);
const warnings = (p: Project) => validateProject(p).filter((i) => i.level === "warning").map((i) => i.code);
const timeline = (p: Project, id: string) => p.timelines.find((t) => t.id === id)!;

/** The camera Mine-imator renders through at a frame: the first camera, in timeline order, that is not hidden and whose
 *  VISIBLE is true there (app_update_animate.gml 136-146; VISIBLE is never interpolated). */
function exportCameraAt(p: Project, frame: number): string | undefined {
  for (const c of p.timelines.filter((t) => t.type === "camera")) {
    if (c.hide === true) continue;
    const keys = Object.keys(c.keyframes ?? {}).map(Number).filter((f) => f <= frame).sort((a, b) => b - a);
    const key = keys.length ? c.keyframes![String(keys[0])] : undefined;
    const visible = key && "VISIBLE" in key ? key.VISIBLE : c.default_values?.VISIBLE ?? true;
    if (visible !== false) return c.id;
  }
  return undefined;
}

function threeCameras() {
  const p = example();
  const close = setCamera(p, { frame: 0, position: [0, -40, 20], rotation: [0, 0, 0], fov: 30 }).camera_id;
  const wide = setCamera(p, { frame: 0, position: [0, -200, 40], rotation: [5, 0, 0], fov: 50 }).camera_id;
  return { p, main: I.camera, close, wide };
}

test("set_shots: exactly one camera renders at every frame, cuts happen on the shot frames", () => {
  const { p, main, close, wide } = threeCameras();
  assert.ok(warnings(p).includes("MULTIPLE_CAMERAS"), "three visible cameras are an ambiguous export");

  const r = setShots(p, [
    { frame: 0, cameraId: main }, { frame: 30, cameraId: close }, { frame: 60, cameraId: wide }, { frame: 90, cameraId: main },
  ]);
  const expected: Array<[number, string]> = [[0, main], [29, main], [30, close], [59, close], [60, wide], [89, wide], [90, main], [500, main]];
  for (const [frame, camera] of expected) assert.equal(exportCameraAt(p, frame), camera, `frame ${frame}`);
  assert.deepEqual(Object.fromEntries(Object.entries(timeline(p, main).keyframes!).map(([f, k]) => [f, k.VISIBLE])), { "0": true, "30": false, "90": true });
  assert.deepEqual(timeline(p, close).keyframes!["0"], { POS_X: 0, POS_Y: -40, POS_Z: 20, ROT_X: 0, ROT_Y: 0, ROT_Z: 0, CAM_FOV: 30, VISIBLE: false });
  assert.deepEqual(timeline(p, close).keyframes!["30"].VISIBLE, true);
  assert.equal(timeline(p, close).keyframes!["30"].POS_Y, -40, "a hold key copies the camera's own pose");
  assert.deepEqual(r.cameras[wide], [0, 60, 90]);
  assert.equal(p.project.view_main_camera, -5);
  valid(p);
  assert.deepEqual(warnings(p).filter((c) => c === "MULTIPLE_CAMERAS" || c === "CAMERA_GAP"), [], "the validator recognises a clean cut list");

  // running it again changes nothing
  const before = structuredClone(p);
  setShots(p, [{ frame: 0, cameraId: main }, { frame: 30, cameraId: close }, { frame: 60, cameraId: wide }, { frame: 90, cameraId: main }]);
  assert.deepEqual(p, before);
});

test("set_shots: a camera outside the list is hidden; a camera may serve several shots; a cut inside a move needs a key", () => {
  const { p, main, close, wide } = threeCameras();
  setCamera(p, { cameraId: close, frame: 60, position: [0, -20, 20], rotation: [0, 0, 0] }); // a push-in from frame 0 to 60
  assert.equal(codeOf(() => setShots(p, [{ frame: 0, cameraId: main }, { frame: 30, cameraId: close }])), "CUT_INSIDE_MOVE");
  setCamera(p, { cameraId: close, frame: 30, position: [0, -30, 20], rotation: [0, 0, 0] });
  setShots(p, [{ frame: 0, cameraId: main }, { frame: 30, cameraId: close }, { frame: 60, cameraId: main }]);
  assert.equal(timeline(p, wide).hide, true);
  assert.equal(timeline(p, close).hide, false);
  assert.equal(exportCameraAt(p, 45), close);
  assert.equal(exportCameraAt(p, 70), main);
  assert.deepEqual(Object.keys(timeline(p, close).keyframes!).map(Number), [0, 30, 60], "no extra keys inside the move");
  valid(p);
});

test("set_shots: refuses a list that cannot work", () => {
  const { p, main, close } = threeCameras();
  assert.equal(codeOf(() => setShots(p, [])), "SHOT_LIST_INVALID");
  assert.equal(codeOf(() => setShots(p, [{ frame: 5, cameraId: main }])), "SHOT_LIST_INVALID");
  assert.equal(codeOf(() => setShots(p, [{ frame: 0, cameraId: main }, { frame: 0, cameraId: close }])), "SHOT_LIST_INVALID");
  assert.equal(codeOf(() => setShots(p, [{ frame: 0, cameraId: I.character }])), "NOT_CAMERA");
  assert.equal(codeOf(() => setShots(p, [{ frame: 0, cameraId: "NOPE" }])), "ID_NOT_FOUND");
});

test("animate_path: keys through points with a transition, a roll along the way, other keys kept", () => {
  const p = example();
  const ball = placeProp(p, null, null, { shape: "sphere", size: 6, position: [0, 0, 3], rotation: [0, 0, 20] }).root_id;
  const r = animatePath(p, {
    timelineId: ball, transition: "easeinquad",
    points: [{ frame: 0, position: [0, 0, 3] }, { frame: 30, position: [30, 40, 3], transition: "linear" }, { frame: 45, position: [30, 40, 3] }],
    spin: { axis: "X", degreesPerUnit: 18 },
  });
  assert.equal(r.distance, 50);
  assert.deepEqual(timeline(p, ball).keyframes, {
    "0": { POS_X: 0, POS_Y: 0, POS_Z: 3, ROT_X: 0, TRANSITION: "easeinquad" },
    "30": { POS_X: 30, POS_Y: 40, POS_Z: 3, ROT_X: 900, TRANSITION: "linear" },
    "45": { POS_X: 30, POS_Y: 40, POS_Z: 3, ROT_X: 900 },
  });
  valid(p);

  // total_degrees is shared out by distance; existing channels of a key at the same frame stay
  const cube = placeProp(p, null, null, { shape: "cube" }).root_id;
  timeline(p, cube).keyframes = { "10": { SCA_X: 2 } };
  animatePath(p, { timelineId: cube, points: [{ frame: 0, position: [0, 0, 0] }, { frame: 10, position: [10, 0, 0] }, { frame: 20, position: [40, 0, 0] }], spin: { axis: "Z", totalDegrees: 360 } });
  assert.deepEqual(timeline(p, cube).keyframes!["10"], { SCA_X: 2, POS_X: 10, POS_Y: 0, POS_Z: 0, ROT_Z: 90, TRANSITION: "linear" });
  assert.equal(timeline(p, cube).keyframes!["20"].ROT_Z, 360);

  // colour keys: a flash on the ball
  addKeyframe(p, { timelineId: ball, frame: 50, values: { RGB_MUL: "#FF0000" } });
  assert.equal(timeline(p, ball).keyframes!["50"].RGB_MUL, "#FF0000");
  assert.equal(codeOf(() => addKeyframe(p, { timelineId: ball, frame: 51, values: { RGB_MUL: "red" } })), "INVALID_VALUE");
  assert.equal(codeOf(() => animatePath(p, { timelineId: ball, points: [{ frame: 0, position: [0, 0, 0] }] })), "PATH_INVALID");
  assert.equal(codeOf(() => animatePath(p, { timelineId: ball, points: [{ frame: 5, position: [0, 0, 0] }, { frame: 5, position: [1, 0, 0] }] })), "PATH_INVALID");
  assert.equal(codeOf(() => animatePath(p, { timelineId: ball, transition: "wobble", points: [{ frame: 0, position: [0, 0, 0] }, { frame: 5, position: [1, 0, 0] }] })), "INVALID_TRANSITION");
  assert.equal(codeOf(() => animatePath(p, { timelineId: ball, points: [{ frame: 0, position: [0, 0, 0] }, { frame: 5, position: [1, 0, 0] }], spin: { axis: "X" } })), "PATH_INVALID");
  assert.equal(codeOf(() => animatePath(p, { timelineId: "NOPE", points: [{ frame: 0, position: [0, 0, 0] }, { frame: 5, position: [1, 0, 0] }] })), "ID_NOT_FOUND");
});

test("poses: the story poses are complete, only bend where the rig allows, and name their source", () => {
  const human = libraries().find((l) => l.rig === "human/wide/steve@1")!;
  for (const name of ["hungry", "lean_to_bite", "jump_cheer", "lift_two_hands", "disappointed"]) {
    const p = example();
    const r = setPose(p, libraries(), { rootId: I.character, frame: 10, pose: name });
    for (const id of Object.values(r.part_ids)) assert.ok(timeline(p, id).keyframes!["10"].ROT_X !== undefined, `${name}: ${id} has a complete key`);
    valid(p);
    assert.ok(human.poses[name].provenance?.numbers, `${name} states where its numbers come from`);
  }
  const arms = (name: string) => human.poses[name].parts;
  assert.equal(arms("jump_cheer").left_arm.ROT_X, -150, "authored value");
  assert.equal(arms("lean_to_bite").body.BEND_ANGLE_X, -25);
  assert.match(human.poses.disappointed.provenance!.numbers, /AUTHORED/);
});

test("cues: frames or seconds, sorted by time, written as cues.json content", () => {
  const cues: Cue[] = [];
  addCue(cues, 30, { seconds: 2.5, label: "gulp", kind: "sfx" });
  addCue(cues, 30, { frame: 6, label: "BIG JUMP!", kind: "text" });
  addCue(cues, 30, { frame: 6, label: "ding", kind: "sfx" });
  addCue(cues, 30, { seconds: 20, label: "What should the hero do?", kind: "narrator" });
  const doc = cuesDocument(cues, { name: "Scene 1", tempo: 30 });
  assert.deepEqual(doc.cues.map((c) => [c.frame, c.seconds, c.label, c.kind]), [
    [6, 0.2, "BIG JUMP!", "text"], [6, 0.2, "ding", "sfx"], [75, 2.5, "gulp", "sfx"], [600, 20, "What should the hero do?", "narrator"],
  ]);
  assert.deepEqual([doc.version, doc.project, doc.tempo], [1, "Scene 1", 30]);
  assert.equal(codeOf(() => addCue(cues, 30, { label: "x", kind: "sfx" })), "CUE_INVALID");
  assert.equal(codeOf(() => addCue(cues, 30, { frame: 1, seconds: 1, label: "x", kind: "sfx" })), "CUE_INVALID");
  assert.equal(codeOf(() => addCue(cues, 30, { frame: -2, label: "x", kind: "sfx" })), "CUE_INVALID");
  assert.equal(codeOf(() => addCue(cues, 30, { frame: 1, label: " ", kind: "sfx" })), "CUE_INVALID");
  assert.equal(codeOf(() => addCue(cues, 30, { frame: 1, label: "x", kind: "music" as never })), "CUE_INVALID");
  assert.equal(cues.length, 4, "failed cues are not kept");
});

// ---- end to end: a longer scene through MCP --------------------------------------------------------------

test("a longer scene through MCP: library mob and props, rolling ball, particles, cuts, cues, save", async () => {
  const { dir, cleanup } = tempDir("mi-ep-");
  const home = makeFakeHome(join(dir, "home"));
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(import.meta.dirname, "..", "src", "main.ts")], env: { MINEIMATOR_HOME: home } }));
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> };
    return { isError: r.isError ?? false, body: JSON.parse(r.content[0].text) };
  };
  const ok = async (name: string, args: Record<string, unknown>) => {
    const r = await call(name, args);
    assert.equal(r.isError, false, `${name}: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  try {
    const source = join(dir, "example.miproject");
    writeFileSync(source, JSON.stringify(example()));
    const sid = (await ok("open_project", { path: source, mode: "new_scene" })).session_id as string;
    await ok("set_output", { session_id: sid, width: 1080, height: 1920, tempo: 30, length_seconds: 4 });

    const hero = (await ok("place_character", { session_id: sid, source_root_id: I.character, name: "hero", position: [0, 0, 0] })).root_id as string;
    await ok("set_pose", { session_id: sid, root_id: hero, frame: 0, pose: "hungry" });
    await ok("set_pose", { session_id: sid, root_id: hero, frame: 30, pose: "lean_to_bite" });
    const ball = (await ok("place_prop", { session_id: sid, shape: "sphere", size: 6, color: "#8B4513", position: [0, 20, 3], name: "ball" })).root_id as string;
    await ok("animate_path", {
      session_id: sid, timeline_id: ball, transition: "easeinquad", spin: { axis: "X", degrees_per_unit: 19 },
      points: [{ frame: 40, position: [0, 20, 3] }, { frame: 70, position: [0, 80, 3] }],
    });
    await ok("place_particles", { session_id: sid, preset: "Pop", sprite: "glitter", start_frame: 70, parent: ball });

    const main = (await ok("set_camera", { session_id: sid, frame: 0, position: [0, -60, 20], rotation: [0, 0, 0], fov: 30 })).camera_id as string;
    const wide = (await ok("set_camera", { session_id: sid, frame: 0, position: [0, -200, 40], rotation: [5, 0, 0], fov: 45 })).camera_id as string;
    const cut = await ok("set_shots", { session_id: sid, shots: [{ frame: 0, camera_id: main }, { frame: 60, camera_id: wide }, { frame: 90, camera_id: main }] });
    assert.deepEqual(cut.hidden_cameras, []);

    await ok("add_cue", { session_id: sid, seconds: 0.2, label: "stomach growl", kind: "sfx" });
    await ok("add_cue", { session_id: sid, frame: 6, label: "BIG JUMP!", kind: "text" });
    const bad = await call("add_cue", { session_id: sid, label: "no time", kind: "sfx" });
    assert.equal(bad.body.error.code, "CUE_INVALID");

    const checked = await ok("validate_project", { session_id: sid });
    assert.equal(checked.valid, true);
    assert.deepEqual(checked.warnings.filter((w: { code: string }) => w.code === "MULTIPLE_CAMERAS" || w.code === "CAMERA_GAP"), []);

    const target = join(dir, "out", "ep.miproject");
    const saved = await ok("save_project", { session_id: sid, path: target });
    assert.equal(saved.cues_path, join(dir, "out", "ep.cues.json"));
    const cues = JSON.parse(readFileSync(saved.cues_path, "utf8"));
    assert.deepEqual(cues.cues.map((c: { frame: number; label: string }) => [c.frame, c.label]), [[6, "stomach growl"], [6, "BIG JUMP!"]]);
    assert.equal(cues.cues[0].seconds, 0.2);
    assert.equal(existsSync(target), true);

    // export_cues never overwrites; an explicit new file works
    assert.equal((await call("export_cues", { session_id: sid })).body.error.code, "DEST_EXISTS");
    const second = await ok("export_cues", { session_id: sid, path: join(dir, "out", "cues.json") });
    assert.equal(second.cues, 2);
    assert.equal((await call("export_cues", { session_id: sid, path: join(dir, "out", "cues.txt") })).body.error.code, "DEST_NOT_ALLOWED");
    // saving again to a new name finds the cue file name taken only if it is the same stem
    assert.equal((await call("save_project", { session_id: sid, path: join(dir, "out", "ep.miproject") })).body.error.code, "DEST_EXISTS");
  } finally {
    await client.close();
    cleanup();
  }
});
