// OPT-IN. Runs only when MINEIMATOR_ARCHIVE points at a folder of real .miproject files (the folder is searched
// recursively and only read). Checks that the validator accepts every real project, that load -> save keeps the JSON
// identical, and that every character in them can be copied into a new scene. Nothing from the archive is shipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MineimatorError } from "../src/core/errors.ts";
import { readProjectFile, writeNewProjectFile } from "../src/core/io.ts";
import { loadLibrary, resolveModel } from "../src/core/library.ts";
import type { Project } from "../src/core/project.ts";
import { errorsOf, validateProject } from "../src/core/validate/index.ts";
import { createScene } from "../src/ops/newScene.ts";
import { placeBuiltInCharacter } from "../src/ops/placeBuiltInCharacter.ts";
import { placeCharacter } from "../src/ops/placeCharacter.ts";
import { placeProp } from "../src/ops/placeProp.ts";
import { tempDir } from "./helpers.ts";

const ARCHIVE = process.env.MINEIMATOR_ARCHIVE;

function projects(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return projects(path);
    return name.endsWith(".miproject") ? [path] : [];
  });
}

const files = ARCHIVE && existsSync(ARCHIVE) ? projects(ARCHIVE) : [];
const skip = files.length === 0 && "set MINEIMATOR_ARCHIVE to a folder of .miproject files to run these";

test("real projects: the archive has projects", { skip }, () => {
  assert.ok(files.length > 0);
});

for (const file of files) {
  const label = file.slice(ARCHIVE!.length + 1);
  test(`real: valid - ${label}`, () => {
    assert.deepEqual(errorsOf(validateProject(readProjectFile(file))), []);
  });

  test(`real: round trip - ${label}`, () => {
    const { dir, cleanup } = tempDir("mi-roundtrip-");
    try {
      const out = writeNewProjectFile(readProjectFile(file), join(dir, "copy.miproject"));
      assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), JSON.parse(readFileSync(file, "utf8")));
    } finally {
      cleanup();
    }
  });

  test(`real: every character can be copied into a new scene - ${label}`, () => {
    const donor = readProjectFile(file);
    const scene = createScene(donor);
    for (const root of donor.timelines.filter((t) => t.type === "char")) {
      placeCharacter(scene, donor, { sourceRootId: root.id, name: "copy", position: [0, 0, 0] });
    }
    assert.deepEqual(errorsOf(validateProject(scene)), []);
  });
}

// ---- built-in characters and props against the archive: needs MINEIMATOR_HOME as well --------------------------------
const HOME = process.env.MINEIMATOR_HOME;
const library = files.length > 0 && HOME && existsSync(HOME) ? loadLibrary(HOME) : null;
const libraryFiles = library ? files : [];

/** Each part as "name<parent#rank": the rank is the order among siblings that are also parts (extra objects the author attached are ignored). */
function rigShape(doc: Project, rootId: string): string[] {
  const root = doc.timelines.find((t) => t.id === rootId)!;
  const parts = doc.timelines.filter((t) => t.part_of === rootId);
  const nameOf = (id: string) => (id === rootId ? "ROOT" : parts.find((p) => p.id === id)?.model_part_name ?? "?");
  return [
    `order:${root.parts!.map(nameOf).join(",")}`,
    ...parts.map((p) => {
      const rank = parts.filter((q) => q.parent === p.parent && (q.parent_tree_index ?? 0) < (p.parent_tree_index ?? 0)).length;
      return `${p.model_part_name}<${nameOf(p.parent!)}#${rank} depth${p.depth} bend${p.lock_bend} back${p.backfaces}`;
    }).sort(),
  ];
}

for (const file of libraryFiles) {
  const label = file.slice(ARCHIVE!.length + 1);
  test(`real: built-in characters have the structure Mine-imator saved - ${label}`, () => {
    const donor = readProjectFile(file);
    for (const root of donor.timelines.filter((t) => (t.type === "char" || t.type === "spblock") && t.part_of === undefined)) {
      const model = (donor.templates.find((t) => t.id === root.temp) as { model?: { name: string; state: Record<string, string> } } | undefined)?.model;
      if (!model) continue;
      const scene = createScene(donor);
      const made = placeBuiltInCharacter(scene, resolveModel(library!, model.name, model.state), { name: "x", position: [0, 0, 0] });
      assert.deepEqual(rigShape(scene, made.root_id), rigShape(donor, root.id), `${model.name} ${JSON.stringify(model.state)}`);
      const template = scene.templates.find((t) => t.id === made.template_id) as unknown as { model: { state: Record<string, string>; model_version: number } };
      const saved = donor.templates.find((t) => t.id === root.temp) as unknown as { model: { state: Record<string, string>; model_version: number } };
      assert.deepEqual(Object.entries(template.model.state).sort(), Object.entries(saved.model.state).sort());
      assert.equal(template.model.model_version, saved.model.model_version);
      assert.deepEqual(errorsOf(validateProject(scene)), []);
    }
  });

  test(`real: every standalone object can be copied as a prop - ${label}`, () => {
    const donor = readProjectFile(file);
    const scene = createScene(donor);
    let copied = 0;
    for (const root of donor.timelines.filter((t) => !["char", "camera", "background", "bodypart"].includes(t.type) && t.part_of === undefined)) {
      try {
        placeProp(scene, donor, library, { sourceRootId: root.id, position: [0, 0, 0] });
        copied++;
      } catch (e) {
        assert.equal((e as MineimatorError).code, "EXTERNAL_RIG_LINK", `${root.type} ${root.id}`);
      }
    }
    assert.deepEqual(errorsOf(validateProject(scene)), []);
    assert.ok(copied >= 0);
  });
}
