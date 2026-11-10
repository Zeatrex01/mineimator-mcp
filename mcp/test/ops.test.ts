// Ops layer: one group per tool, on the generic example project. Ops are pure, so no files are involved
// except where a tool is defined by them (set_skin reads a PNG header: the handler does that, tested in tools.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MineimatorError } from "../src/core/errors.ts";
import { cloneProject, type Project } from "../src/core/project.ts";
import { errorsOf, validateProject } from "../src/core/validate/index.ts";
import { addKeyframe } from "../src/ops/addKeyframe.ts";
import { createScene } from "../src/ops/newScene.ts";
import { listTemplates } from "../src/ops/listTemplates.ts";
import { listTimelines } from "../src/ops/listTimelines.ts";
import { placeCharacter } from "../src/ops/placeCharacter.ts";
import { placeSet } from "../src/ops/placeSet.ts";
import { setCamera } from "../src/ops/setCamera.ts";
import { setOutput } from "../src/ops/setOutput.ts";
import { setPose } from "../src/ops/setPose.ts";
import { setSkin } from "../src/ops/setSkin.ts";
import { EXAMPLE_IDS as I, example, libraries } from "./helpers.ts";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as MineimatorError).code;
  }
  return undefined;
};
const valid = (p: Project) => assert.deepEqual(errorsOf(validateProject(p)), []);
const timeline = (p: Project, id: string) => p.timelines.find((t) => t.id === id)!;

// --- list_templates / list_timelines
test("list_templates: lists the rig with its root; donor templates appear after new_scene", () => {
  const p = example();
  const entries = listTemplates(p, null);
  const rig = entries.find((e) => e.id === I.template)!;
  assert.equal(rig.model, "human/wide/steve@1");
  assert.equal(rig.skin, "default");
  assert.deepEqual(rig.source_root_ids, [I.character]);
  assert.equal(rig.origin, "scene");

  const scene = createScene(p);
  const both = listTemplates(scene, p);
  assert.equal(both.filter((e) => e.origin === "scene").length, 0);
  assert.ok(both.some((e) => e.origin === "donor" && e.id === I.template));
  assert.deepEqual(listTemplates(scene, p, { type: "block" }).map((e) => e.id), [I.blockTemplate]);
});

test("list_timelines: a root lists itself and its seven parts", () => {
  const rows = listTimelines(example(), { rootId: I.character });
  assert.equal(rows.length, 8);
  assert.equal(rows[0].id, I.character);
  assert.deepEqual(new Set(rows.slice(1).map((r) => r.model_part_name)), new Set(["body", "head", "hat", "left_arm", "right_arm", "left_leg", "right_leg"]));
  assert.equal(codeOf(() => listTimelines(example(), { rootId: "NOPE" })), "ID_NOT_FOUND");
  assert.deepEqual(listTimelines(example(), { type: "camera" }).map((r) => r.id), [I.camera]);
});

// --- new_scene
test("new_scene: empty scene with the donor's settings; background resources stay", () => {
  const donor = example();
  donor.resources.push({ id: "RESOURCE00000001", type: "pack", filename: "pack.zip" }, { id: "RESOURCE00000002", type: "skin", filename: "s.png" });
  donor.background = { ground_tex: "RESOURCE00000001", sky_time: 3 };
  const scene = createScene(donor);
  assert.equal(scene.timelines.length, 0);
  assert.equal(scene.templates.length, 0);
  assert.deepEqual(scene.resources.map((r) => r.id), ["RESOURCE00000001"]);
  assert.equal(scene.project.video_width, donor.project.video_width);
  assert.equal(donor.timelines.length > 0, true, "the donor is untouched");
  valid(scene);
});

// --- place_character
test("place_character: disjoint ids, internal links remapped, source untouched", () => {
  const p = example();
  const before = cloneProject(p);
  const r = placeCharacter(p, null, { sourceRootId: I.character, name: "Copy", position: [10, 20, 0] });

  assert.deepEqual(before.timelines, p.timelines.slice(0, before.timelines.length), "source timelines are untouched");
  const copyIds = new Set(Object.values(r.id_map));
  const oldIds = new Set(Object.keys(r.id_map));
  assert.equal(copyIds.size, 8);
  for (const id of copyIds) assert.ok(!oldIds.has(id));

  const root = timeline(p, r.root_id);
  assert.equal(root.name, "Copy");
  assert.equal(root.parent, "root");
  assert.deepEqual(root.default_values, { POS_X: 10, POS_Y: 20, POS_Z: 0, ROT_Z: 30 }, "position set, facing kept from the frame-0 pose");
  assert.deepEqual(new Set(root.parts), new Set(Object.values(r.part_ids)));
  for (const id of root.parts!) {
    const part = timeline(p, id);
    assert.ok(copyIds.has(part.parent!), `${part.model_part_name} parent`);
    assert.equal(part.part_of, root.id);
    assert.equal(part.temp, root.temp);
  }
  assert.notEqual(root.temp, I.template, "the copy owns a new template");
  assert.equal(p.templates.length, 3);
  assert.equal(timeline(p, r.part_ids.head).parent, r.part_ids.body);
  valid(p);
});

test("place_character: bakes the frame-0 pose as defaults and drops the animation", () => {
  const p = example();
  const r = placeCharacter(p, null, { sourceRootId: I.character, name: "Copy", position: [0, 0, 0] });
  const head = timeline(p, r.part_ids.head);
  assert.deepEqual(head.keyframes, {});
  assert.deepEqual(head.default_values, { ROT_X: 5 }, "frame-0 value kept, TRANSITION dropped");
  assert.deepEqual(timeline(p, r.root_id).default_values, { POS_X: 0, POS_Y: 0, POS_Z: 0, ROT_Z: 30 });
});

test("place_character: copies from a donor and brings the resources it needs", () => {
  const donor = example();
  donor.resources.push({ id: "SKIN000000000001", type: "skin", filename: "a.png", player_skin: true });
  donor.templates[0].model_tex = "SKIN000000000001";
  const scene = createScene(donor);
  const r = placeCharacter(scene, donor, { sourceRootId: I.character, name: "Guest", position: [0, 0, 0] });
  assert.deepEqual(scene.resources.map((x) => x.id), ["SKIN000000000001"]);
  assert.equal(scene.templates[0].model_tex, "SKIN000000000001");
  assert.equal(scene.timelines.length, 8);
  assert.ok(r.root_id);
  valid(scene);
  // a second copy reuses the identical resource instead of duplicating it
  placeCharacter(scene, donor, { sourceRootId: I.character, name: "Guest 2", position: [5, 0, 0] });
  assert.equal(scene.resources.length, 1);
  valid(scene);
});

test("place_character: a clashing resource id is re-id'd, and reference channels follow", () => {
  const donor = example();
  donor.resources.push({ id: "SKIN000000000001", type: "skin", filename: "a.png" });
  donor.templates[0].model_tex = "SKIN000000000001";
  donor.timelines.find((t) => t.id === I.head)!.keyframes!["0"].TEXTURE_OBJ = "SKIN000000000001";
  const scene = createScene(donor);
  scene.resources.push({ id: "SKIN000000000001", type: "skin", filename: "different.png" });
  const r = placeCharacter(scene, donor, { sourceRootId: I.character, name: "Guest", position: [0, 0, 0] });
  const copied = scene.resources.find((x) => x.filename === "a.png")!;
  assert.notEqual(copied.id, "SKIN000000000001");
  assert.equal(scene.templates[0].model_tex, copied.id);
  assert.equal(timeline(scene, r.part_ids.head).default_values!.TEXTURE_OBJ, copied.id);
  valid(scene);
});

test("place_character: errors", () => {
  const p = example();
  assert.equal(codeOf(() => placeCharacter(p, null, { sourceRootId: I.camera, name: "x", position: [0, 0, 0] })), "NOT_CHARACTER");
  assert.equal(codeOf(() => placeCharacter(p, null, { sourceRootId: "NOPE", name: "x", position: [0, 0, 0] })), "ID_NOT_FOUND");
  // a rig tied to something outside itself cannot be copied
  p.timelines.find((t) => t.id === I.head)!.keyframes!["0"].ATTRACTOR = I.block;
  assert.equal(codeOf(() => placeCharacter(p, null, { sourceRootId: I.character, name: "x", position: [0, 0, 0] })), "EXTERNAL_RIG_LINK");
  assert.equal(p.timelines.length, 11, "a failed copy adds nothing: the draft is only extended once every link is resolved");
});

test("place_set: copies a folder with its children and keeps the animation; refuses characters", () => {
  const donor = example();
  const scene = createScene(donor);
  const r = placeSet(scene, donor, { sourceRootId: I.props });
  assert.equal(scene.timelines.length, 2);
  const folder = timeline(scene, r.root_id);
  const block = scene.timelines.find((t) => t.type === "block")!;
  assert.equal(block.parent, folder.id);
  assert.deepEqual(block.keyframes!["0"], { POS_X: 48, POS_Y: 16, POS_Z: 0, ROT_Z: 45 });
  assert.equal(scene.templates.length, 1);
  valid(scene);
  assert.equal(codeOf(() => placeSet(scene, donor, { sourceRootId: I.character })), "INVALID_VALUE");
});

// --- set_skin
test("set_skin: only the chosen rig's skin changes (shared template is cloned first)", () => {
  const p = example();
  const r = placeCharacter(p, null, { sourceRootId: I.character, name: "Copy", position: [0, 0, 0] });
  const staged = new Map<string, string>();
  const out = setSkin(p, staged, { rootId: I.character, sourcePath: "C:/skins/alex.png", size: { width: 64, height: 64 } });
  assert.equal(out.template_cloned, false, "the original owns its template alone");
  assert.equal(p.templates.find((t) => t.id === I.template)!.model_tex, out.resource_id);
  assert.equal(timeline(p, r.root_id).temp !== I.template, true);
  assert.equal(p.templates.find((t) => t.id === timeline(p, r.root_id).temp)!.model_tex, "default", "the copy keeps the default skin");
  assert.deepEqual([...staged], [["alex.png", "C:/skins/alex.png"]]);
  assert.deepEqual(p.resources[0], { id: out.resource_id, type: "skin", filename: "alex.png", player_skin: true, material_format: 2 });
  valid(p);

  // two characters sharing one template: the second set_skin splits them
  const q = example();
  const extra = structuredClone(q.timelines.find((t) => t.id === I.character)!);
  extra.id = "EXTRA00000000001";
  extra.parts = [];
  extra.parent_tree_index = 9;
  q.timelines.push(extra);
  const res = setSkin(q, new Map(), { rootId: "EXTRA00000000001", sourcePath: "C:/skins/b.png", size: { width: 64, height: 32 } });
  assert.equal(res.template_cloned, true);
  assert.equal(q.templates.find((t) => t.id === I.template)!.model_tex, "default");
  assert.equal(timeline(q, "EXTRA00000000001").temp, res.template_id);
  valid(q);
});

test("set_skin: sizes, characters, filename clashes", () => {
  const p = example();
  const staged = new Map<string, string>();
  assert.equal(codeOf(() => setSkin(p, staged, { rootId: I.character, sourcePath: "x.png", size: { width: 128, height: 128 } })), "UNSUPPORTED_SKIN_SIZE");
  assert.equal(codeOf(() => setSkin(p, staged, { rootId: I.camera, sourcePath: "x.png", size: { width: 64, height: 64 } })), "NOT_CHARACTER");
  const a = setSkin(p, staged, { rootId: I.character, sourcePath: "C:/a/skin.png", size: { width: 64, height: 64 } });
  const again = setSkin(p, staged, { rootId: I.character, sourcePath: "C:/a/skin.png", size: { width: 64, height: 64 } });
  assert.equal(again.resource_id, a.resource_id, "the same file is one resource");
  const other = setSkin(p, staged, { rootId: I.character, sourcePath: "D:/b/skin.png", size: { width: 64, height: 64 } });
  assert.equal(other.asset_plan.filename, "skin-2.png", "a different file with the same name is renamed");
});

// --- add_keyframe
test("add_keyframe: merges into an existing key and keeps other channels", () => {
  const p = example();
  addKeyframe(p, { timelineId: I.rightArm, frame: 15, values: { ROT_X: -30 } });
  assert.deepEqual(p.timelines.find((t) => t.id === I.rightArm)!.keyframes!["15"], { ROT_X: -30, ROT_Z: 12, TRANSITION: "easeinoutsine" });
  const r = addKeyframe(p, { timelineId: I.rightArm, frame: 40, values: { ROT_X: 5 } });
  assert.deepEqual(r.changed_keys, ["ROT_X"]);
  assert.deepEqual(p.timelines.find((t) => t.id === I.rightArm)!.keyframes!["40"], { ROT_X: 5 }, "a new key does not carry the previous pose");
  valid(p);
});

test("add_keyframe: errors", () => {
  const p = example();
  const add = (timelineId: string, values: Record<string, number | boolean | string>, frame = 3) => () => addKeyframe(p, { timelineId, frame, values });
  assert.equal(codeOf(add(I.rightArm, { BEND_ANGLE_Y: 5 })), "UNSUPPORTED_BEND");
  assert.equal(codeOf(add(I.head, { BEND_ANGLE_X: 5 })), "UNSUPPORTED_BEND");
  assert.equal(codeOf(add(I.body, { BEND_ANGLE_Z: 5 })), undefined, "the body bends on all three axes");
  assert.equal(codeOf(add(I.rightArm, { TRANSITION: "wobble" })), "INVALID_TRANSITION");
  assert.equal(codeOf(add(I.rightArm, { WIGGLE: 1 })), "UNSUPPORTED_CHANNEL");
  assert.equal(codeOf(add(I.rightArm, { GLOW_COLOR: "#FF0000" })), "UNSUPPORTED_CHANNEL");
  assert.equal(codeOf(add(I.rightArm, { CAM_FOV: 50 })), "UNSUPPORTED_CHANNEL", "camera channel on a body part");
  assert.equal(codeOf(add(I.camera, { CAM_FOV: 500 })), "INVALID_VALUE");
  assert.equal(codeOf(add(I.rightArm, { ALPHA: 2 })), "INVALID_VALUE");
  assert.equal(codeOf(add(I.rightArm, { ROT_X: "high" })), "INVALID_VALUE");
  assert.equal(codeOf(add(I.rightArm, { ROT_X: Infinity })), "INVALID_VALUE");
  assert.equal(codeOf(add(I.rightArm, {}, 3)), "INVALID_VALUE");
  assert.equal(codeOf(add(I.rightArm, { ROT_X: 1 }, -1)), "INVALID_VALUE");
  assert.equal(codeOf(add("NOPE", { ROT_X: 1 })), "ID_NOT_FOUND");
});

// --- set_pose
test("set_pose: writes complete keys on every part from the library", () => {
  const p = example();
  const r = setPose(p, libraries(), { rootId: I.character, frame: 30, pose: "surprised" });
  assert.deepEqual(new Set(Object.keys(r.part_ids)), new Set(["body", "head", "left_arm", "right_arm", "left_leg", "right_leg"]));
  const key = (part: string) => timeline(p, r.part_ids[part]).keyframes!["30"];
  assert.equal(key("left_arm").ROT_X, -65);
  assert.equal(key("right_arm").ROT_X, -75);
  assert.equal(key("head").ROT_X, 8);
  assert.equal(key("left_arm").ROT_Y, 0, "owned channels the pose leaves out are written as zero");
  assert.equal(key("left_arm").TRANSITION, "easeinoutsine");
  assert.ok(!("BEND_ANGLE_Y" in key("left_arm")), "unsupported bends are never written");
  assert.equal(key("left_arm").BEND_ANGLE_X, 0);
  assert.equal(key("body").BEND_ANGLE_Z, 0);
  assert.ok(!("BEND_ANGLE_X" in key("head")));
  assert.equal(timeline(p, I.character).keyframes!["30"], undefined, "the root is not touched");
  assert.ok(!("30" in timeline(p, I.hat).keyframes!), "parts outside the library are left alone");
  valid(p);
});

test("set_pose: replaces an earlier pose key, keeping unrelated channels", () => {
  const p = example();
  setPose(p, libraries(), { rootId: I.character, frame: 0, pose: "surprised" });
  setPose(p, libraries(), { rootId: I.character, frame: 0, pose: "neutral" });
  const arm = timeline(p, I.rightArm).keyframes!["0"];
  assert.equal(arm.ROT_X, 0);
  assert.equal(arm.TRANSITION, "easeinoutsine");
});

test("set_pose: errors", () => {
  const p = example();
  assert.equal(codeOf(() => setPose(p, libraries(), { rootId: I.character, frame: 1, pose: "dancing" })), "POSE_NOT_FOUND");
  assert.equal(codeOf(() => setPose(p, libraries(), { rootId: I.camera, frame: 1, pose: "neutral" })), "NOT_CHARACTER");
  p.templates[0].model = { name: "human", state: { type: "slim", variant: "steve" }, model_version: 1 };
  assert.equal(codeOf(() => setPose(p, libraries(), { rootId: I.character, frame: 1, pose: "neutral" })), "RIG_MISMATCH");
  const q = example();
  q.timelines = q.timelines.filter((t) => t.id !== I.leftLeg);
  q.timelines.find((t) => t.id === I.character)!.parts = q.timelines.find((t) => t.id === I.character)!.parts!.filter((x) => x !== I.leftLeg);
  assert.equal(codeOf(() => setPose(q, libraries(), { rootId: I.character, frame: 1, pose: "neutral" })), "RIG_MISMATCH");
});

// --- set_camera
test("set_camera: creates a camera that looks along +Y and becomes the only visible one", () => {
  const p = example();
  const r = setCamera(p, { frame: 0, position: [0, -80, 24], rotation: [0, 0, 0], fov: 30, activate: true });
  assert.equal(r.created, true);
  const cam = timeline(p, r.camera_id);
  assert.equal(cam.type, "camera");
  assert.equal(cam.temp, "null");
  assert.equal(cam.parent, "root");
  assert.deepEqual(cam.keyframes!["0"], { POS_X: 0, POS_Y: -80, POS_Z: 24, ROT_X: 0, ROT_Y: 0, ROT_Z: 0, CAM_FOV: 30 });
  assert.equal(timeline(p, I.camera).hide, true, "the other camera is hidden");
  assert.equal(p.project.view_main_camera, r.camera_id);
  assert.equal(p.project.view_second_camera, -5);
  valid(p);
});

test("set_camera: edits a camera, carries the field of view so it does not jump to 45", () => {
  const p = example();
  const first = setCamera(p, { frame: 0, position: [0, -80, 24], rotation: [0, 0, 0], fov: 28 });
  const second = setCamera(p, { cameraId: first.camera_id, frame: 30, position: [0, -40, 24], rotation: [0, 0, 0] });
  assert.equal(second.created, false);
  assert.equal(timeline(p, first.camera_id).keyframes!["30"].CAM_FOV, 28);
  assert.equal(second.warnings[0].code, "FOV_CARRIED");
  valid(p);
});

test("set_camera: errors", () => {
  const p = example();
  const args = { frame: 0, position: [0, 0, 0], rotation: [0, 0, 0] } as const;
  assert.equal(codeOf(() => setCamera(p, { ...args, cameraId: I.character })), "NOT_CAMERA");
  assert.equal(codeOf(() => setCamera(p, { ...args, cameraId: "NOPE" })), "ID_NOT_FOUND");
  assert.equal(codeOf(() => setCamera(p, { ...args, fov: 0 })), "INVALID_VALUE");
  assert.equal(codeOf(() => setCamera(p, { ...args, position: [0, Number.NaN, 0] })), "INVALID_VALUE");
  const folder = timeline(p, I.props);
  folder.hide = true;
  timeline(p, I.camera).parent = I.props;
  assert.equal(codeOf(() => setCamera(p, { ...args, cameraId: I.camera, activate: true })), "HIDDEN_PARENT");
  assert.equal(codeOf(() => setCamera(p, { ...args, cameraId: I.camera })), undefined, "not activating is fine");
});

// --- set_output
test("set_output: 1080x1920, 30 fps, 5 s is region 0..150", () => {
  const p = example();
  const before = JSON.stringify(p.timelines);
  const r = setOutput(p, { width: 1080, height: 1920, tempo: 30, lengthSeconds: 5 });
  assert.equal(r.region_end, 150);
  const timelineSettings = p.project.timeline as Record<string, unknown>;
  assert.equal(timelineSettings.region_start, 0);
  assert.equal(timelineSettings.region_end, 150);
  assert.deepEqual([p.project.video_width, p.project.video_height, p.project.tempo, p.project.video_keep_aspect_ratio], [1080, 1920, 30, false]);
  assert.equal(JSON.stringify(p.timelines), before, "no key is retimed or removed");
  valid(p);
});

test("set_output: fixes cameras that ignore the project size; rejects fractional frames", () => {
  const p = example();
  timeline(p, I.camera).default_values!.CAM_SIZE_USE_PROJECT = false;
  timeline(p, I.camera).keyframes!["5"] = { CAM_SIZE_USE_PROJECT: false, CAM_WIDTH: 512 };
  setOutput(p, { width: 1080, height: 1920, tempo: 30, lengthSeconds: 5 });
  assert.equal(timeline(p, I.camera).default_values!.CAM_SIZE_USE_PROJECT, true);
  assert.equal(timeline(p, I.camera).keyframes!["5"].CAM_SIZE_USE_PROJECT, true);
  assert.equal(codeOf(() => setOutput(p, { width: 1080, height: 1920, tempo: 24, lengthSeconds: 5.01 })), "NONINTEGRAL_DURATION");
  assert.equal(codeOf(() => setOutput(p, { width: 0, height: 1920, tempo: 30, lengthSeconds: 5 })), "INVALID_VALUE");
});
