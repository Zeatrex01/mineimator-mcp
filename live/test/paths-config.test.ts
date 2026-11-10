import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HOME, loadConfig } from "../src/config.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasUnsavedMarker, normaliseProjectPath, projectName, titleShowsProject } from "../src/paths.ts";
import { readProjectName } from "../src/project-meta.ts";

test("project paths: drive letter, .miproject, slashes fixed", () => {
  assert.equal(normaliseProjectPath("C:/a/b/scene.miproject"), "C:\\a\\b\\scene.miproject");
  assert.equal(normaliseProjectPath("  D:\\x\\Scene.MIPROJECT "), "D:\\x\\Scene.MIPROJECT");
  for (const bad of ["scene.miproject", "..\\scene.miproject", "C:\\a\\scene.txt", "\\\\server\\share\\a.miproject", ""]) {
    assert.throws(() => normaliseProjectPath(bad), (e: { code?: string }) => e.code === "BAD_PATH", bad);
  }
});

test("the project name is the file name without .miproject, and the title check ignores case", () => {
  assert.equal(projectName("C:\\work\\milestone-1\\milestone-1.miproject"), "milestone-1");
  assert.ok(titleShowsProject("Milestone-1 * - Mine-imator", "milestone-1"));
  assert.ok(!titleShowsProject("Mine-imator", "milestone-1"));
  assert.ok(!titleShowsProject("anything", ""));
});

test("the title check accepts any of several names (inner project name or file name)", () => {
  assert.ok(titleShowsProject("My Scene - Mine-imator", ["My Scene", "milestone-1"]));
  assert.ok(titleShowsProject("My Scene - Mine-imator", [undefined, "my SCENE"]));
  assert.ok(!titleShowsProject("Mine-imator", [undefined, ""]));
});

test("unsaved marker: seen live as 'name *  - Mine-imator', absent when saved", () => {
  assert.ok(hasUnsavedMarker("My Scene *  - Mine-imator"));
  assert.ok(hasUnsavedMarker("a * - Mine-imator"));
  assert.ok(!hasUnsavedMarker("My Scene - Mine-imator"));
  assert.ok(!hasUnsavedMarker("Mine-imator"));
  assert.ok(!hasUnsavedMarker("star*name - Mine-imator"));
});

test("the inner project name is read from project.name; unreadable files give undefined", () => {
  const dir = mkdtempSync(join(tmpdir(), "mi-live-"));
  try {
    writeFileSync(join(dir, "a.miproject"), JSON.stringify({ project: { name: "My Scene" } }));
    writeFileSync(join(dir, "b.miproject"), "not json");
    writeFileSync(join(dir, "c.miproject"), JSON.stringify({ project: {} }));
    assert.equal(readProjectName(join(dir, "a.miproject")), "My Scene");
    assert.equal(readProjectName(join(dir, "b.miproject")), undefined);
    assert.equal(readProjectName(join(dir, "c.miproject")), undefined);
    assert.equal(readProjectName(join(dir, "missing.miproject")), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("config: MINEIMATOR_HOME wins, otherwise the default folder", () => {
  assert.equal(loadConfig({}).home, DEFAULT_HOME);
  assert.equal(loadConfig({ MINEIMATOR_HOME: "X:\\mi" }).exe, "X:\\mi\\Mine-imator.exe");
  assert.equal(loadConfig({ MINEIMATOR_HOME: "  " }).home, DEFAULT_HOME);
});
