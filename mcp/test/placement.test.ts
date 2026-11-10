// Placement math and the building ops: block cells, anchors, place_blocks, give_item, set_parent, VISIBLE keys.
// A block or item is centred on its position in X and Y with its bottom at the position's Z: that is what Mine-imator does
// (checked on screen, README "Placement"); these tests pin down what the ops make of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadPoseLibraries, loadPoseLibrariesWithLocal } from "../src/core/poseLibrary.ts";
import { MineimatorError } from "../src/core/errors.ts";
import { loadLibrary, resolveModel } from "../src/core/library.ts";
import { parseProject, type Project } from "../src/core/project.ts";
import { errorsOf, validateProject } from "../src/core/validate/index.ts";
import { addKeyframe } from "../src/ops/addKeyframe.ts";
import { giveItem } from "../src/ops/giveItem.ts";
import { createScene } from "../src/ops/newScene.ts";
import { placeBlocks, cellPosition, cellsOf } from "../src/ops/placeBlocks.ts";
import { placeBuiltInCharacter } from "../src/ops/placeBuiltInCharacter.ts";
import { placeProp } from "../src/ops/placeProp.ts";
import { setParent } from "../src/ops/setParent.ts";
import { config, example, makeFakeHome, tempDir } from "./helpers.ts";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as MineimatorError).code;
  }
  return undefined;
};
const valid = (p: Project) => assert.deepEqual(errorsOf(validateProject(p)), []);
const scene = () => createScene(example());
const at = (p: Project, id: string) => p.timelines.find((t) => t.id === id)!.default_values!;
const withHome = <T>(fn: (home: string) => T): T => {
  const { dir, cleanup } = tempDir("mi-home-");
  try {
    return fn(makeFakeHome(dir));
  } finally {
    cleanup();
  }
};

test("cell math: cell [i,j,k] occupies 16 units from its minimum corner; the timeline sits at centre-bottom", () => {
  assert.deepEqual(cellPosition([0, 0, 0]), [8, 8, 0]);
  assert.deepEqual(cellPosition([2, -1, 3]), [40, -8, 48]);
  assert.deepEqual(cellPosition([1, 1, 1], [100, 0, -16]), [124, 24, 0]);
});

test("cells of an entry: single, line, solid box, hollow box; a line must run along one axis", () => {
  assert.equal(cellsOf({ kind: "single", block: "stone", from: [1, 2, 3] }).length, 1);
  assert.equal(cellsOf({ kind: "line", block: "stone", from: [0, 0, 0], to: [4, 0, 0] }).length, 5);
  assert.equal(cellsOf({ kind: "line", block: "stone", from: [3, 0, 0], to: [0, 0, 0] }).length, 4, "either direction");
  assert.equal(cellsOf({ kind: "box", block: "stone", from: [0, 0, 0], to: [2, 3, 4] }).length, 3 * 4 * 5);
  assert.equal(cellsOf({ kind: "box", block: "stone", from: [0, 0, 0], to: [2, 2, 2], hollow: true }).length, 26, "27 minus the centre");
  assert.equal(codeOf(() => cellsOf({ kind: "line", block: "stone", from: [0, 0, 0], to: [1, 1, 0] })), "INVALID_VALUE");
  assert.equal(codeOf(() => cellsOf({ kind: "single", block: "stone", from: [0.5, 0, 0] })), "INVALID_VALUE");
  assert.equal(codeOf(() => cellsOf({ kind: "box", block: "stone", from: [0, 0, 0], to: [99, 99, 99] })), "INVALID_VALUE", "size cap");
});

test("place_prop anchor: bottom_center keeps the position, corner moves it half a block in X and Y; blocks only", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const p = scene();
    const centre = placeProp(p, null, lib, { block: "stone", position: [16, 32, 8] });
    const corner = placeProp(p, null, lib, { block: "stone", position: [16, 32, 8], anchor: "corner" });
    assert.deepEqual([at(p, centre.root_id).POS_X, at(p, centre.root_id).POS_Y, at(p, centre.root_id).POS_Z], [16, 32, 8]);
    assert.deepEqual([at(p, corner.root_id).POS_X, at(p, corner.root_id).POS_Y, at(p, corner.root_id).POS_Z], [24, 40, 8]);
    assert.equal(codeOf(() => placeProp(p, null, lib, { item: "bread", anchor: "corner" })), "INVALID_VALUE");
    assert.equal(codeOf(() => placeProp(p, null, lib, { block: "stone", anchor: "middle" as never })), "INVALID_VALUE");
    valid(p);
  }));

test("place_blocks: a hollow room with a doorway; one template per block+state; last entry wins; air carves", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const p = scene();
    const r = placeBlocks(p, lib, {
      origin: [0, 0, 0],
      entries: [
        { kind: "box", block: "stone", from: [0, 0, 0], to: [4, 3, 4], hollow: true },
        { kind: "box", block: "planks", state: { variant: "birch" }, from: [0, 0, 0], to: [4, 0, 4] },
        { kind: "single", block: "air", from: [2, 0, 1] },
        { kind: "line", block: "planks", from: [0, 3, 0], to: [4, 3, 0] },
      ],
    });
    // shell of 5x4x5 = 100 - 3x2x3 inner = 82; floor layer (5x5 = 25) turns birch (the floor was part of the shell); the door cell is removed (-1)
    assert.equal(r.placed, 82 - 1);
    assert.equal(r.templates, 3, "stone, birch planks, oak planks (the line)");
    assert.deepEqual(r.bounds, { min: [0, 0, 0], max: [4, 3, 4] });
    const names = new Set(p.timelines.map((t) => t.name));
    assert.ok(names.has("block_0_0_0") && !names.has("block_2_0_1"), "the doorway cell is empty");
    const corner = p.timelines.find((t) => t.name === "block_0_0_0")!;
    assert.deepEqual([corner.default_values!.POS_X, corner.default_values!.POS_Y, corner.default_values!.POS_Z], [8, 8, 0]);
    const top = p.timelines.find((t) => t.name === "block_4_3_4")!;
    assert.deepEqual([top.default_values!.POS_X, top.default_values!.POS_Y, top.default_values!.POS_Z], [72, 56, 64]);
    const floor = p.timelines.find((t) => t.name === "block_1_0_1")!;
    assert.equal((p.templates.find((t) => t.id === floor.temp)!.block as { state: { variant: string } }).state.variant, "birch");
    valid(p);

    assert.equal(codeOf(() => placeBlocks(p, lib, { entries: [{ kind: "single", block: "plank", from: [0, 0, 0] }] })), "LIBRARY_ENTRY_NOT_FOUND");
    assert.equal(codeOf(() => placeBlocks(p, null, { entries: [{ kind: "single", block: "stone", from: [0, 0, 0] }] })), "LIBRARY_NOT_CONFIGURED");
    assert.equal(codeOf(() => placeBlocks(p, lib, { entries: [] })), "INVALID_VALUE");
  }));

test("place_blocks: origin shifts the grid and parent attaches every block", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const p = scene();
    const folder = placeProp(p, null, lib, { block: "stone", name: "anchor" }).root_id;
    const r = placeBlocks(p, lib, { entries: [{ kind: "single", block: "stone", from: [1, 0, 0] }], origin: [-24, 0, 0], parent: folder });
    const t = p.timelines.find((x) => x.id === r.root_ids[0])!;
    assert.equal(t.parent, folder);
    assert.equal(t.default_values!.POS_X, -24 + 24);
    valid(p);
  }));

test("a library character can be turned about Z at placement; the default keeps it facing +Y with no rotation set", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const p = scene();
    const hen = resolveModel(lib, "hen", undefined);
    const a = placeBuiltInCharacter(p, hen, { name: "a", position: [0, 0, 0] });
    const b = placeBuiltInCharacter(p, hen, { name: "b", position: [0, 0, 0], rotationZ: 180 });
    assert.equal(at(p, a.root_id).ROT_Z, undefined);
    assert.equal(at(p, b.root_id).ROT_Z, 180);
    assert.equal(codeOf(() => placeBuiltInCharacter(p, hen, { name: "c", position: [0, 0, 0], rotationZ: Number.NaN })), "INVALID_VALUE");
  }));

test("give_item: refused for a character without arms and for non-characters", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const p = scene();
    const hen = placeBuiltInCharacter(p, resolveModel(lib, "hen", undefined), { name: "hen", position: [0, 0, 0] });
    assert.equal(codeOf(() => giveItem(p, lib, { characterId: hen.root_id, hand: "right", item: "bread" })), "INVALID_VALUE");
    const block = placeProp(p, null, lib, { block: "stone" }).root_id;
    assert.equal(codeOf(() => giveItem(p, lib, { characterId: block, hand: "right", item: "bread" })), "NOT_CHARACTER");
  }));

const REAL_HOME = process.env.MINEIMATOR_HOME && existsSync(process.env.MINEIMATOR_HOME) ? process.env.MINEIMATOR_HOME : undefined;
test("give_item on the real human: the item is a child of the arm part, at the documented offset", { skip: !REAL_HOME && "set MINEIMATOR_HOME" }, () => {
  const lib = loadLibrary(REAL_HOME!);
  const p = scene();
  const human = placeBuiltInCharacter(p, resolveModel(lib, "human", undefined), { name: "h", position: [0, 0, 0] });
  const r = giveItem(p, lib, { characterId: human.root_id, hand: "left", item: "diamond_sword" });
  assert.equal(r.hand_part_id, human.part_ids.left_arm);
  const item = p.timelines.find((t) => t.id === r.item_id)!;
  assert.equal(item.type, "item");
  assert.equal(item.parent, human.part_ids.left_arm);
  assert.equal(item.default_values!.POS_Z, -12);
  valid(p);
});

test("set_parent: moves a timeline, keeps its numbers, refuses cycles, body parts and missing parents", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const p = scene();
    const a = placeProp(p, null, lib, { block: "stone", name: "a", position: [8, 0, 0] }).root_id;
    const b = placeProp(p, null, lib, { block: "stone", name: "b" }).root_id;
    const c = placeProp(p, null, lib, { block: "stone", name: "c", parent: b }).root_id;
    const r = setParent(p, { timelineId: a, parent: b });
    assert.equal(r.previous_parent, "root");
    const ta = p.timelines.find((t) => t.id === a)!;
    assert.equal(ta.parent, b);
    assert.equal(ta.default_values!.POS_X, 8, "numbers kept, not converted to the new parent's space");
    assert.equal(ta.parent_tree_index, 1, "after c");
    setParent(p, { timelineId: a, parent: "root" });
    assert.equal(p.timelines.find((t) => t.id === a)!.parent, "root");
    assert.equal(codeOf(() => setParent(p, { timelineId: b, parent: c })), "INVALID_VALUE", "into its own subtree");
    assert.equal(codeOf(() => setParent(p, { timelineId: b, parent: b })), "INVALID_VALUE");
    assert.equal(codeOf(() => setParent(p, { timelineId: a, parent: "NOPE" })), "ID_NOT_FOUND");
    const hen = placeBuiltInCharacter(p, resolveModel(lib, "hen", undefined), { name: "hen", position: [0, 0, 0] });
    assert.equal(codeOf(() => setParent(p, { timelineId: hen.part_ids.body, parent: a })), "INVALID_VALUE", "a body part");
    valid(p);
  }));

test("VISIBLE keys work on any timeline (blocks, items, characters, particles) and must be true or false", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const p = scene();
    const block = placeProp(p, null, lib, { block: "stone" }).root_id;
    const hen = placeBuiltInCharacter(p, resolveModel(lib, "hen", undefined), { name: "hen", position: [0, 0, 0] }).root_id;
    for (const id of [block, hen]) {
      addKeyframe(p, { timelineId: id, frame: 0, values: { VISIBLE: false } });
      addKeyframe(p, { timelineId: id, frame: 10, values: { VISIBLE: true } });
    }
    assert.deepEqual(p.timelines.find((t) => t.id === block)!.keyframes, { 0: { VISIBLE: false }, 10: { VISIBLE: true } });
    assert.equal(codeOf(() => addKeyframe(p, { timelineId: block, frame: 5, values: { VISIBLE: 1 as never } })), "INVALID_VALUE");
    valid(p);
  }));

test("the shipped example scenes are valid, built from library blocks and the library human, with no primitive shapes", () => {
  const dir = new URL("../examples/scenes/", import.meta.url);
  for (const name of ["walk-cycle", "run-cycle", "jump"]) {
    const file = new URL(`${name}.miproject`, dir);
    if (!existsSync(file)) assert.fail(`${name}.miproject is missing (node examples/build-scenes.ts)`);
    const p = parseProject(readFileSync(file, "utf8"), name);
    valid(p);
    const types = new Set(p.timelines.map((t) => t.type));
    assert.ok(types.has("block") && types.has("char") && types.has("camera"), `${name}: blocks, a character and a camera`);
    for (const shape of ["cube", "cone", "cylinder", "sphere"]) assert.ok(!types.has(shape), `${name}: no ${shape} shapes`);
    assert.ok(p.templates.some((t) => t.type === "char" && (t.model as { name: string }).name === "human"), `${name}: the library human`);
    assert.equal(p.project.timeline && (p.project.timeline as { marker?: number }).marker, 0, `${name}: opens at frame 0`);
  }
});

test("private pose libraries: data/local-style folder merges into the shipped library of the same rig, local wins; missing folder is fine", () => {
  const { dir, cleanup } = tempDir("mi-local-");
  try {
    const shipped = loadPoseLibraries(config().posesDir);
    const human = shipped.find((l) => l.rig === "human/wide/steve@1")!;
    const local = { ...human, poses: { surprised: { ...human.poses.surprised, parts: { head: { ROT_X: 99 } } }, only_local: { ...human.poses.neutral } } };
    writeFileSync(join(dir, "mine.json"), JSON.stringify(local));
    const merged = loadPoseLibrariesWithLocal(config().posesDir, dir).find((l) => l.rig === human.rig)!;
    assert.equal(merged.poses.surprised.parts.head.ROT_X, 99, "local wins on a name clash");
    assert.ok(merged.poses.only_local && merged.poses.walk_a, "local adds, shipped stays");
    assert.equal(loadPoseLibrariesWithLocal(config().posesDir, join(dir, "nope")).length, shipped.length, "a missing folder changes nothing");
  } finally {
    cleanup();
  }
});
