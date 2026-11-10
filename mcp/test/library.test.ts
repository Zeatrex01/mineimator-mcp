// The built-in library: reading an install (a made-up one here), list_library, built-in characters, props and particles.
// Tests on a real install are at the bottom and run only when MINEIMATOR_HOME is set (read only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MineimatorError } from "../src/core/errors.ts";
import { loadLibrary, loadPreset, resolveModel } from "../src/core/library.ts";
import { type Project } from "../src/core/project.ts";
import { errorsOf, validateProject } from "../src/core/validate/index.ts";
import { listLibrary } from "../src/ops/listLibrary.ts";
import { createScene } from "../src/ops/newScene.ts";
import { placeBuiltInCharacter } from "../src/ops/placeBuiltInCharacter.ts";
import { placeParticles } from "../src/ops/placeParticles.ts";
import { placeProp } from "../src/ops/placeProp.ts";
import { example, makeFakeHome, tempDir } from "./helpers.ts";

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
const withHome = <T>(fn: (home: string) => T): T => {
  const { dir, cleanup } = tempDir("mi-home-");
  try {
    return fn(makeFakeHome(dir));
  } finally {
    cleanup();
  }
};

test("loadLibrary reads the version named in settings.midata and every list", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    assert.equal(lib.version, "9.9");
    assert.deepEqual([...lib.characters.keys()], ["hen", "human"]);
    assert.deepEqual([...lib.specialBlocks.keys()], ["crate"]);
    assert.deepEqual(lib.blocks.get("planks")!.states, { variant: ["oak", "birch"] });
    assert.deepEqual(lib.blocks.get("cake")!.defaultState, [["bites", "0"]]);
    assert.deepEqual(lib.items, ["item/apple", "item/bread", "item/cooked_beef"]);
    assert.deepEqual(lib.presetNames, ["Pop", "Puff"]);
    assert.equal(codeOf(() => loadLibrary(join(home, "nowhere"))), "LIBRARY_UNREADABLE");
  }));

test("list_library: summary, details per kind, search and limit", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const summary = listLibrary(lib, {}) as { counts: Record<string, number>; characters: string[] };
    assert.equal(summary.counts.blocks, 3);
    assert.deepEqual(summary.characters, ["hen", "human"]);

    const hen = (listLibrary(lib, { kind: "characters", search: "hen" }) as { rows: Array<{ name: string; states: unknown; default_state: unknown }> }).rows;
    assert.deepEqual(hen, [{ name: "hen", states: { age: ["adult", "chick"] }, default_state: { age: "adult" } }]);
    const items = listLibrary(lib, { kind: "items", search: "bre" }) as { rows: unknown[] };
    assert.deepEqual(items.rows, [{ name: "item/bread", slot: 1 }]);
    const blocks = listLibrary(lib, { kind: "blocks", limit: 2 }) as { total: number; shown: number };
    assert.deepEqual([blocks.total, blocks.shown], [3, 2]);

    const presets = new Map(lib.presetNames.map((n) => [n, loadPreset(lib, n)]));
    const particles = listLibrary(lib, { kind: "particles" }, presets) as { presets: Array<{ name: string; mode: string }>; sprites: string[] };
    assert.deepEqual(particles.presets.map((p) => [p.name, p.mode]), [["Pop", "burst"], ["Puff", "constant"]]);
    assert.deepEqual(particles.sprites, ["generic", "heart", "glitter"]);
    assert.deepEqual((listLibrary(lib, { kind: "shapes" }) as { shapes: string[] }).shapes, ["cube", "cone", "cylinder", "sphere"]);
  }));

test("a built-in character: template, root and parts are made the way Mine-imator makes them", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const p = scene();
    const r = placeBuiltInCharacter(p, resolveModel(lib, "hen"), { name: "Hilda", position: [10, 20, 0] });

    const template = p.templates.find((t) => t.id === r.template_id)!;
    assert.deepEqual(template, {
      id: r.template_id, type: "char", name: "", model_tex: "default", model_tex_material: "default", model_tex_normal: "default",
      model_use_blend_color: false, model_blend_color: "#FFFFFF", model: { name: "hen", state: { age: "adult" }, model_version: 3 },
    });
    const root = p.timelines.find((t) => t.id === r.root_id)!;
    assert.equal(root.type, "char");
    assert.equal(root.name, "Hilda");
    assert.equal(root.temp, template.id);
    assert.equal(root.parent, "root");
    assert.deepEqual(root.default_values, { POS_X: 10, POS_Y: 20, POS_Z: 0 });

    const byName = (n: string) => p.timelines.find((t) => t.id === r.part_ids[n])!;
    // parts[] follows the model file's flat list: children before their parent (post-order)
    assert.deepEqual(root.parts!.map((id) => p.timelines.find((t) => t.id === id)!.model_part_name), ["comb", "head", "right_wing", "left_wing", "body", "right_leg", "left_leg"]);
    const parentName = (n: string) => (byName(n).parent === root.id ? "ROOT" : p.timelines.find((t) => t.id === byName(n).parent)!.model_part_name);
    assert.deepEqual(
      ["body", "head", "comb", "right_wing", "left_wing", "right_leg", "left_leg"].map((n) => `${n}<${parentName(n)}#${byName(n).parent_tree_index}`),
      ["body<ROOT#0", "head<body#0", "comb<head#0", "right_wing<body#1", "left_wing<body#2", "right_leg<ROOT#1", "left_leg<ROOT#2"],
    );
    for (const part of root.parts!.map((id) => p.timelines.find((t) => t.id === id)!)) {
      assert.equal(part.type, "bodypart");
      assert.equal(part.part_of, root.id);
      assert.equal(part.temp, template.id);
      assert.equal(part.scale_resize, false);
      assert.deepEqual((part.inherit as Record<string, boolean>).alpha, true);
    }
    assert.equal(byName("left_wing").depth, 2);
    assert.equal(byName("left_wing").backfaces, true);
    assert.equal(byName("body").backfaces, false);
    valid(p);
  }));

test("a built-in character: states pick the model file and hide parts; children of a hidden part stay under the root", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const p = scene();
    const chick = resolveModel(lib, "hen", { age: "chick" });
    assert.equal(chick.file, "chick.mimodel");
    assert.deepEqual(chick.hidden, ["comb"]);
    const r = placeBuiltInCharacter(p, chick, { name: "Chick", position: [0, 0, 0] });
    assert.deepEqual(Object.keys(r.part_ids).sort(), ["body", "head", "leg"]);
    assert.deepEqual(r.state, { age: "chick" });
    valid(p);

    // special blocks use the same path with a "spblock" template
    const crate = placeBuiltInCharacter(p, resolveModel(lib, "crate"), { name: "Crate", position: [0, 0, 0] });
    assert.equal(p.timelines.find((t) => t.id === crate.root_id)!.type, "spblock");
    assert.equal(p.templates.find((t) => t.id === crate.template_id)!.type, "spblock");
    valid(p);

    assert.equal(codeOf(() => resolveModel(lib, "hens")), "LIBRARY_ENTRY_NOT_FOUND");
    assert.equal(codeOf(() => resolveModel(lib, "hen", { age: "old" })), "LIBRARY_STATE_INVALID");
    assert.equal(codeOf(() => resolveModel(lib, "hen", { colour: "red" })), "LIBRARY_STATE_INVALID");
    assert.equal(codeOf(() => placeBuiltInCharacter(p, chick, { name: "x", position: [0, 0] as never })), "INVALID_VALUE");
  }));

test("place_prop: shapes need no library; size sets the scale; colour, parent and rotation are resting values", () => {
  const p = scene();
  const sphere = placeProp(p, null, null, { shape: "sphere", name: "meatball", position: [5, 6, 7], size: 6, color: "#8b4513" });
  const t = p.timelines.find((x) => x.id === sphere.root_id)!;
  assert.equal(t.type, "sphere");
  assert.deepEqual(t.default_values, { POS_X: 5, POS_Y: 6, POS_Z: 7, SCA_X: 0.375, SCA_Y: 0.375, SCA_Z: 0.375, RGB_MUL: "#8B4513" });
  assert.deepEqual(p.templates.find((x) => x.id === sphere.template_id)!.shape, {
    tex: "null", tex_material: "null", tex_normal: "null", tex_mapped: false, tex_hoffset: 0, tex_voffset: 0, tex_hrepeat: 1, tex_vrepeat: 1,
    tex_hmirror: false, tex_vmirror: false, closed: true, invert: false, detail: 32, face_camera: false,
  });
  assert.equal(t.wind, false);

  const child = placeProp(p, null, null, { shape: "cube", scale: [1, 2, 3], rotation: [0, 0, 45], parent: sphere.root_id });
  const c = p.timelines.find((x) => x.id === child.root_id)!;
  assert.equal(c.parent, sphere.root_id);
  assert.equal(c.parent_tree_index, 0);
  assert.deepEqual(c.default_values, { POS_X: 0, POS_Y: 0, POS_Z: 0, ROT_X: 0, ROT_Y: 0, ROT_Z: 45, SCA_X: 1, SCA_Y: 2, SCA_Z: 3 });
  valid(p);

  assert.equal(codeOf(() => placeProp(p, null, null, {})), "INVALID_VALUE");
  assert.equal(codeOf(() => placeProp(p, null, null, { shape: "cube", item: "apple" })), "INVALID_VALUE");
  assert.equal(codeOf(() => placeProp(p, null, null, { shape: "torus" })), "INVALID_VALUE");
  assert.equal(codeOf(() => placeProp(p, null, null, { shape: "cube", size: 4, scale: 2 })), "INVALID_VALUE");
  assert.equal(codeOf(() => placeProp(p, null, null, { block: "stone" })), "LIBRARY_NOT_CONFIGURED");
  assert.equal(codeOf(() => placeProp(p, null, null, { shape: "cube", color: "red" })), "INVALID_VALUE");
});

test("place_prop: blocks and items come from the library, with validated names and states", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const p = scene();
    const plank = placeProp(p, null, lib, { block: "planks", state: { variant: "birch" }, position: [16, 0, 0] });
    assert.deepEqual(p.templates.find((x) => x.id === plank.template_id)!.block, {
      name: "planks", state: { variant: "birch" }, tex: "default", tex_material: "default", tex_normal: "default", randomize: true, repeat_enable: false, repeat: [1, 1, 1],
    });
    const stone = placeProp(p, null, lib, { block: "stone" });
    assert.deepEqual((p.templates.find((x) => x.id === stone.template_id)!.block as { state: unknown }).state, { variant: "stone" }, "default state from the library");
    assert.equal(p.timelines.find((x) => x.id === plank.root_id)!.texture_filtering, true);

    const bread = placeProp(p, null, lib, { item: "bread", name: "loaf" });
    assert.deepEqual(p.templates.find((x) => x.id === bread.template_id)!.item, {
      tex: "default", tex_material: "default", tex_normal: "default", name: "item/bread", "3d": true, face_camera: false, bounce: false, spin: false,
    });
    assert.equal(p.timelines.find((x) => x.id === bread.root_id)!.type, "item");
    valid(p);

    assert.equal(codeOf(() => placeProp(p, null, lib, { block: "plank" })), "LIBRARY_ENTRY_NOT_FOUND");
    assert.equal(codeOf(() => placeProp(p, null, lib, { block: "planks", state: { variant: "pine" } })), "LIBRARY_STATE_INVALID");
    assert.equal(codeOf(() => placeProp(p, null, lib, { item: "sword" })), "LIBRARY_ENTRY_NOT_FOUND");
    assert.equal(p.timelines.length, 3);
  }));

test("place_prop: copies a non-character object from the donor; refuses characters, cameras and parts", () => {
  const donor = example();
  const p = createScene(donor);
  const copy = placeProp(p, donor, null, { sourceRootId: "EXAMPLE000000021", position: [9, 9, 9], color: "#FF0000", name: "block copy" });
  const block = p.timelines.find((t) => t.id === copy.root_id)!;
  assert.equal(block.name, "block copy");
  assert.deepEqual(block.default_values, { POS_X: 9, POS_Y: 9, POS_Z: 9, ROT_Z: 45, RGB_MUL: "#FF0000" }, "frame-0 look baked (its rotation stays), position replaced");
  assert.deepEqual(block.keyframes, {});
  assert.notEqual(block.temp, "EXAMPLE000000002");
  valid(p);

  const kept = placeProp(p, donor, null, { sourceRootId: "EXAMPLE000000021", keepAnimation: true, position: [1, 1, 1] });
  assert.deepEqual(Object.keys(p.timelines.find((t) => t.id === kept.root_id)!.keyframes!), ["0"]);
  assert.equal(kept.warnings.length, 1, "the kept key sets POS and wins over the resting position");

  assert.equal(codeOf(() => placeProp(p, donor, null, { sourceRootId: "EXAMPLE000000010" })), "PROP_UNSUPPORTED");
  assert.equal(codeOf(() => placeProp(p, donor, null, { sourceRootId: "EXAMPLE000000030" })), "PROP_UNSUPPORTED");
  assert.equal(codeOf(() => placeProp(p, donor, null, { sourceRootId: "EXAMPLE000000012" })), "PROP_UNSUPPORTED");
  assert.equal(codeOf(() => placeProp(p, donor, null, { sourceRootId: "NOPE" })), "ID_NOT_FOUND");
});

test("place_particles: a constant preset streams between two frames; a burst fires once; every copy gets fresh ids", () =>
  withHome((home) => {
    const lib = loadLibrary(home);
    const p = scene();
    const puff = placeParticles(p, lib, loadPreset(lib, "Puff"), { presetName: "Puff", position: [1, 2, 3], startFrame: 30, endFrame: 40, amount: 3000, sprite: "heart", color: "#ff66aa" });
    assert.equal(puff.mode, "constant");
    const tl = p.timelines.find((t) => t.id === puff.root_id)!;
    assert.equal(tl.type, "particles");
    assert.equal(tl.rot_point, undefined, "a spawner has no rotation point (project_save_timeline.gml)");
    assert.deepEqual(tl.default_values, { POS_X: 1, POS_Y: 2, POS_Z: 3, RGB_MUL: "#FF66AA" });
    assert.deepEqual(tl.keyframes, { "0": { SPAWN: false }, "30": { SPAWN: true }, "40": { SPAWN: false } });
    const template = p.templates.find((t) => t.id === puff.template_id)!;
    const body = template.particles as { spawn_amount: number; types: Array<{ id: string; sprite_template: string }> };
    assert.equal(template.type, "particles");
    assert.equal(body.spawn_amount, 3000);
    assert.equal(body.types[0].sprite_template, "heart");
    assert.notEqual(body.types[0].id, "PUFFPUFFPUFFPUFF");

    const second = placeParticles(p, lib, loadPreset(lib, "Puff"), { presetName: "Puff" });
    const secondBody = p.templates.find((t) => t.id === second.template_id)!.particles as typeof body;
    assert.notEqual(secondBody.types[0].id, body.types[0].id);
    assert.deepEqual(p.timelines.find((t) => t.id === second.root_id)!.keyframes, { "0": { SPAWN: true } });
    assert.equal(secondBody.types[0].sprite_template, "generic", "the preset itself is untouched");

    const pop = placeParticles(p, lib, loadPreset(lib, "Pop"), { presetName: "Pop", startFrame: 12, endFrame: 99, parent: puff.root_id });
    assert.equal(pop.mode, "burst");
    const popTl = p.timelines.find((t) => t.id === pop.root_id)!;
    assert.deepEqual(popTl.keyframes, { "0": { SPAWN: false }, "12": { SPAWN: true }, "13": { SPAWN: false } }, "end_frame is ignored by a burst");
    assert.equal(popTl.parent, puff.root_id);
    const embedded = p.templates.filter((t) => t.type === "block");
    assert.equal(embedded.length, 1, "the preset's own block template is copied with a fresh id");
    const popTypes = (p.templates.find((t) => t.id === pop.template_id)!.particles as { types: Array<{ temp?: string }> }).types;
    assert.equal(popTypes[1].temp, embedded[0].id);
    assert.notEqual(embedded[0].id, "CRUMBCRUMBCRUMBC");
    valid(p);

    assert.equal(codeOf(() => placeParticles(p, lib, loadPreset(lib, "Puff"), { presetName: "Puff", sprite: "star" })), "LIBRARY_ENTRY_NOT_FOUND");
    assert.equal(codeOf(() => placeParticles(p, lib, loadPreset(lib, "Puff"), { presetName: "Puff", startFrame: 10, endFrame: 10 })), "INVALID_VALUE");
    assert.equal(codeOf(() => placeParticles(p, null, loadPreset(lib, "Puff"), { presetName: "Puff" })), "LIBRARY_NOT_CONFIGURED");
    assert.equal(codeOf(() => loadPreset(lib, "Rain")), "LIBRARY_ENTRY_NOT_FOUND");
  }));

// ---- the real install (read only) -----------------------------------------------------------------------------
const HOME = process.env.MINEIMATOR_HOME;
const skipReal = !(HOME && existsSync(join(HOME, "Data"))) && "set MINEIMATOR_HOME to an installed Mine-imator to run these";

test("real install: the counts, and every model, block, item and preset can be added and the scene validates", { skip: skipReal }, () => {
  const lib = loadLibrary(HOME!);
  assert.deepEqual(
    [lib.characters.size, lib.specialBlocks.size, lib.blocks.size, lib.items.length, lib.presetNames.length],
    [61, 31, 285, 596, 14],
    "Mine-imator 2.0.2 with the 1.20.2 assets",
  );

  const p = scene();
  for (const name of [...lib.characters.keys(), ...lib.specialBlocks.keys()]) {
    const model = resolveModel(lib, name);
    const r = placeBuiltInCharacter(p, model, { name, position: [0, 0, 0] });
    assert.equal(Object.keys(r.part_ids).length > 0, true, `${name} has parts`);
  }
  for (const name of lib.blocks.keys()) placeProp(p, null, lib, { block: name });
  for (const item of lib.items.filter((i) => i !== "")) placeProp(p, null, lib, { item }); // 11 slots of the list are empty
  for (const preset of lib.presetNames) placeParticles(p, lib, loadPreset(lib, preset), { presetName: preset, startFrame: 3 });
  valid(p);
});

test("real install: the humans the app saves (steve and alex) and a chicken come out as expected", { skip: skipReal }, () => {
  const lib = loadLibrary(HOME!);
  const p = scene();
  const human = placeBuiltInCharacter(p, resolveModel(lib, "human", { type: "slim", variant: "alex" }), { name: "A", position: [0, 0, 0] });
  const chicken = placeBuiltInCharacter(p, resolveModel(lib, "chicken"), { name: "C", position: [0, 0, 0] });
  assert.deepEqual(Object.keys(human.part_ids).sort(), ["body", "hat", "head", "left_arm", "left_leg", "right_arm", "right_leg"]);
  assert.deepEqual(Object.keys(chicken.part_ids).sort(), ["body", "head", "left_leg", "left_wing", "right_leg", "right_wing"]);
  assert.deepEqual(human.state, { type: "slim", variant: "alex" });
  valid(p);
});
