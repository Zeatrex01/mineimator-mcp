// open_project mode "new_scene": an empty scene built from a donor project. The donor's output settings, render
// settings and background are kept; timelines, markers and templates are cleared; only the resources the background
// needs (for example its ground texture) stay. The donor itself is kept by the session so its rigs can be listed and copied.
import { SENTINELS } from "../core/ids.ts";
import type { Project } from "../core/project.ts";

function resourceIdsIn(value: unknown, known: Set<string>, found: Set<string>): void {
  if (typeof value === "string") {
    if (known.has(value) && !SENTINELS.has(value)) found.add(value);
  } else if (Array.isArray(value)) value.forEach((v) => resourceIdsIn(v, known, found));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => resourceIdsIn(v, known, found));
}

export function createScene(donor: Project): Project {
  const scene = structuredClone(donor);
  scene.timelines = [];
  scene.templates = [];
  if ("markers" in scene) scene.markers = [];

  const known = new Set(donor.resources.map((r) => r.id));
  const needed = new Set<string>();
  resourceIdsIn(scene.background, known, needed);
  scene.resources = scene.resources.filter((r) => needed.has(r.id));

  scene.project.view_main_camera = -4;
  scene.project.view_second_camera = -5;
  const timeline = (scene.project.timeline ??= {}) as Record<string, unknown>;
  timeline.region_start = "null";
  timeline.region_end = "null";
  timeline.marker = 0; // a new scene opens at frame 0, not where the donor was left
  return scene;
}
