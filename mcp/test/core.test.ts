// Core layer: ids, parsing, validation rules, PNG reading, exclusive saving, asset copying.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest, copyAssets } from "../src/core/assets.ts";
import { MineimatorError } from "../src/core/errors.ts";
import { ID_PATTERN, newId } from "../src/core/ids.ts";
import { checkDestination, writeNewProjectFile } from "../src/core/io.ts";
import { errorMessages } from "../src/core/messages.ts";
import { readPngSize } from "../src/core/png.ts";
import { parseProject } from "../src/core/project.ts";
import { validateProject } from "../src/core/validate/index.ts";
import { EXAMPLE_IDS as I, example, makePng, tempDir } from "./helpers.ts";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as MineimatorError).code;
  }
  return undefined;
};
const errorCodes = (p = example()) => validateProject(p).filter((i) => i.level === "error").map((i) => i.code);

test("new ids match the pattern and are unique", () => {
  const taken = new Set<string>();
  for (let i = 0; i < 1000; i++) assert.match(newId(taken), ID_PATTERN);
  assert.equal(taken.size, 1000);
});

test("parseProject reports stable codes", () => {
  assert.equal(codeOf(() => parseProject("{nope")), "INVALID_JSON");
  assert.equal(codeOf(() => parseProject("[]")), "UNSUPPORTED_FORMAT");
  assert.equal(codeOf(() => parseProject('{"project":{},"templates":[],"timelines":[],"resources":[]}')), "UNSUPPORTED_FORMAT");
});

test("every error code has an English message", () => {
  for (const [code, message] of Object.entries(errorMessages)) assert.ok(message({}).length > 5, code);
});

test("the generic example is a valid project", () => {
  assert.deepEqual(validateProject(example()).filter((i) => i.level === "error"), []);
});

test("validator: dangling references, duplicate ids, bad ids", () => {
  const p = example();
  p.timelines[2].parent = "ZZZZZZZZZZZZZZZZ";
  p.timelines[1].temp = "YYYYYYYYYYYYYYYY";
  p.timelines.push({ ...p.timelines[0] });
  p.templates[0].id = "lowercase";
  const codes = errorCodes(p);
  assert.ok(codes.includes("DANGLING_REFERENCE"));
  assert.ok(codes.includes("DUPLICATE_ID"));
  assert.ok(codes.includes("BAD_ID"));
});

test("validator: parent cycles, duplicate sibling index, inconsistent parts", () => {
  const p = example();
  p.timelines.find((t) => t.id === I.body)!.parent = I.head; // body under head under body
  assert.ok(errorCodes(p).includes("PARENT_CYCLE"));

  const q = example();
  q.timelines.find((t) => t.id === I.leftLeg)!.parent_tree_index = 1; // same as right_leg
  assert.ok(errorCodes(q).includes("DUPLICATE_SIBLING_INDEX"));

  const r = example();
  r.timelines.find((t) => t.id === I.character)!.parts!.pop();
  assert.ok(errorCodes(r).includes("RIG_INCONSISTENT"));
});

test("validator: keyframes - frames, transitions, types, bend axes", () => {
  const p = example();
  const arm = p.timelines.find((t) => t.id === I.rightArm)!;
  arm.keyframes!["007"] = { ROT_X: 1 };
  arm.keyframes!["20"] = { TRANSITION: "wobble", ROT_X: "high", BEND_ANGLE_Y: 3 };
  const codes = errorCodes(p);
  assert.ok(codes.includes("INVALID_FRAME"));
  assert.ok(codes.includes("INVALID_TRANSITION"));
  assert.ok(codes.includes("INVALID_VALUE"));
  assert.ok(codes.includes("UNSUPPORTED_BEND"));
});

test("validator: output size, tempo and region", () => {
  const p = example();
  p.project.video_width = 0;
  p.project.tempo = -1;
  (p.project.timeline as Record<string, unknown>).region_start = 50;
  (p.project.timeline as Record<string, unknown>).region_end = 10;
  const codes = errorCodes(p);
  assert.ok(codes.includes("INVALID_OUTPUT"));
  assert.ok(codes.includes("INVALID_REGION"));
});

test("validator: template and keyframe references must resolve", () => {
  const p = example();
  p.templates[0].model_tex = "NOTARESOURCE0001";
  p.timelines.find((t) => t.id === I.head)!.keyframes!["0"].TEXTURE_OBJ = "NOTARESOURCE0002";
  const pointers = validateProject(p).filter((i) => i.code === "DANGLING_REFERENCE").map((i) => i.pointer);
  assert.ok(pointers.some((x) => x.endsWith("/model_tex")));
  assert.ok(pointers.some((x) => x.endsWith("/TEXTURE_OBJ")));
});

test("validator: cameras are only warnings", () => {
  const p = example();
  p.timelines = p.timelines.filter((t) => t.type !== "camera");
  const issues = validateProject(p);
  assert.ok(issues.some((i) => i.code === "NO_CAMERA" && i.level === "warning"));
  assert.deepEqual(issues.filter((i) => i.level === "error"), []);
});

test("PNG size is read from the header; junk is rejected", () => {
  assert.deepEqual(readPngSize(makePng(64, 32)), { width: 64, height: 32 });
  assert.equal(codeOf(() => readPngSize(Buffer.from("not a png at all, just some text bytes....."))), "INVALID_PNG");
  assert.equal(codeOf(() => readPngSize(Buffer.alloc(3))), "INVALID_PNG");
});

test("saving never overwrites and needs the .miproject extension", () => {
  const { dir, cleanup } = tempDir();
  try {
    const path = join(dir, "a.miproject");
    writeFileSync(path, "{}");
    assert.equal(codeOf(() => writeNewProjectFile(example(), path)), "DEST_EXISTS");
    assert.equal(readFileSync(path, "utf8"), "{}");
    assert.equal(codeOf(() => checkDestination(join(dir, "a.json"), undefined)), "DEST_NOT_ALLOWED");
    const out = writeNewProjectFile(example(), join(dir, "nested", "b.miproject"));
    assert.ok(existsSync(out));
    assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), example());
  } finally {
    cleanup();
  }
});

test("output root: destinations outside it are refused", () => {
  const { dir, cleanup } = tempDir();
  try {
    mkdirSync(join(dir, "allowed"));
    assert.doesNotThrow(() => checkDestination(join(dir, "allowed", "x", "a.miproject"), join(dir, "allowed")));
    assert.equal(codeOf(() => checkDestination(join(dir, "other", "a.miproject"), join(dir, "allowed"))), "DEST_NOT_ALLOWED");
    assert.equal(codeOf(() => checkDestination(join(dir, "allowed", "..", "a.miproject"), join(dir, "allowed"))), "DEST_NOT_ALLOWED");
  } finally {
    cleanup();
  }
});

test("assets: manifest, copying next to a new project, missing files, cache-only worlds", () => {
  const { dir, cleanup } = tempDir();
  try {
    const src = join(dir, "src");
    const dest = join(dir, "dest");
    mkdirSync(src);
    writeFileSync(join(src, "tex.png"), makePng(16, 16));
    writeFileSync(join(src, "world.meshcache"), "cache");
    const p = example();
    p.resources.push(
      { id: "RES0000000000001", type: "texture", filename: "tex.png" },
      { id: "RES0000000000002", type: "fromworld", filename: "world" },
    );
    let manifest = buildManifest(p, src);
    assert.deepEqual(manifest.map((m) => m.status), ["present", "cache_only"]);
    const { filenames, created } = copyAssets(manifest, dest);
    assert.deepEqual(filenames, ["tex.png", "world"]);
    assert.ok(existsSync(join(dest, "tex.png")) && existsSync(join(dest, "world.meshcache")));
    assert.equal(created.length, 2);
    assert.doesNotThrow(() => copyAssets(manifest, dest)); // identical files already there

    p.resources.push({ id: "RES0000000000003", type: "texture", filename: "gone.png" });
    manifest = buildManifest(p, src);
    assert.equal(codeOf(() => copyAssets(manifest, join(dir, "dest2"))), "MISSING_ASSET");
    assert.equal(existsSync(join(dir, "dest2", "tex.png")), false, "nothing is copied when an asset is missing");

    p.resources.push({ id: "RES0000000000004", type: "texture", filename: "../escape.png" });
    writeFileSync(join(dir, "escape.png"), "x");
    assert.equal(codeOf(() => copyAssets(buildManifest(p, src).filter((m) => m.filename.startsWith("..")), dest)), "DEST_NOT_ALLOWED");
  } finally {
    cleanup();
  }
});
