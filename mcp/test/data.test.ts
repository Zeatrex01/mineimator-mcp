// Data files: the pose library validates, its published JSON schema matches the code, the example is current.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadPoseLibraries, parsePoseLibrary, poseLibraryJsonSchema } from "../src/core/poseLibrary.ts";
import { buildExampleScene } from "../scripts/example-scene.ts";
import { config } from "./helpers.ts";

const root = join(import.meta.dirname, "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

test("the shipped pose libraries load, and the basic poses are present", () => {
  const libs = loadPoseLibraries(config().posesDir);
  assert.ok(libs.length >= 1);
  const human = libs.find((l) => l.rig === "human/wide/steve@1")!;
  assert.deepEqual(Object.keys(human.poses).sort(), ["disappointed", "hungry", "jump_air", "jump_cheer", "jump_crouch", "jump_land", "lean_to_bite", "lift_two_hands", "neutral", "relieved", "run_a", "run_b", "surprised", "thinking", "walk_a", "walk_b"]);
  assert.equal(human.poses.surprised.parts.right_arm.ROT_X, -75);
  assert.equal(human.poses.thinking.transition, "instant");
});

test("a pose library with a bad transition, unknown part or unsupported bend is rejected", () => {
  const good = JSON.parse(read("data", "poses", "human-wide-steve.json"));
  const mutate = (fn: (lib: typeof good) => void) => {
    const copy = structuredClone(good);
    fn(copy);
    return () => parsePoseLibrary(JSON.stringify(copy), "test");
  };
  assert.throws(mutate((l) => (l.poses.surprised.transition = "wobble")), /transition/);
  assert.throws(mutate((l) => (l.poses.surprised.parts.tail = { ROT_X: 1 })), /not in base/);
  assert.throws(mutate((l) => (l.poses.surprised.parts.head = { BEND_ANGLE_X: 1 })), /cannot bend/);
  assert.throws(mutate((l) => (l.poses.surprised.extra = 1)), /./);
  assert.doesNotThrow(mutate(() => undefined));
});

test("data/poses/pose-library.schema.json is generated from the code (run npm run build:data)", () => {
  assert.deepEqual(JSON.parse(read("data", "poses", "pose-library.schema.json")), JSON.parse(JSON.stringify(poseLibraryJsonSchema())));
});

test("examples/generic-scene.miproject is generated from scripts/example-scene.ts (run npm run build:data)", () => {
  assert.deepEqual(JSON.parse(read("examples", "generic-scene.miproject")), buildExampleScene());
});
