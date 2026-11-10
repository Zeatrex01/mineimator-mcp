// Every id stored in a reference field must point at something that exists, or be one of the reserved words.
// Sentinels observed in real projects: "null" (no template/parent/image), "root" (top-level),
// "default" (built-in texture), and view selectors -4 (work camera) / -5 (active camera).
import { REFERENCE_CHANNELS } from "../format.ts";
import { SENTINELS } from "../ids.ts";
import type { Project } from "../project.ts";
import type { Report } from "./report.ts";

const TEMPLATE_REF_KEYS = /^(model_tex|model_tex_material|model_tex_normal|tex|tex_material|tex_normal|scenery|model|sprite_tex|sprite_template_tex|glint_tex)$/;
const BACKGROUND_REF_KEYS = /(^|_)tex(_material|_normal)?$|^image$/;

function walkRefs(value: unknown, pattern: RegExp, pointer: string, visit: (id: string, pointer: string) => void): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkRefs(v, pattern, `${pointer}/${i}`, visit));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && pattern.test(k)) visit(v, `${pointer}/${k}`);
      else if (v && typeof v === "object") walkRefs(v, pattern, `${pointer}/${k}`, visit);
    }
  }
}

export function checkReferences(project: Project, r: Report): void {
  const templates = new Set(project.templates.map((t) => t.id));
  const timelines = new Set(project.timelines.map((t) => t.id));
  const resources = new Set(project.resources.map((x) => x.id));
  const dangling = (pointer: string, message: string) => r.error("DANGLING_REFERENCE", pointer, message);

  project.timelines.forEach((t, i) => {
    const at = `/timelines/${i}`;
    // Folders, cameras, audio: "null". Body parts: the character's template. Blocks/text: sometimes another timeline.
    if (t.temp !== undefined && !SENTINELS.has(t.temp) && !templates.has(t.temp) && !timelines.has(t.temp)) {
      dangling(`${at}/temp`, `temp ${t.temp} is neither a template nor a timeline`);
    }
    for (const field of ["parent", "part_of", "part_root"] as const) {
      const ref = t[field];
      if (ref !== undefined && !SENTINELS.has(ref) && !timelines.has(ref)) dangling(`${at}/${field}`, `${field} ${ref} is not a timeline`);
    }
    (t.parts ?? []).forEach((id, j) => {
      if (!timelines.has(id)) dangling(`${at}/parts/${j}`, `parts entry ${id} is not a timeline`);
    });
    const valueSets: Array<[string, Record<string, unknown> | undefined]> = [
      [`${at}/default_values`, t.default_values],
      ...Object.entries(t.keyframes ?? {}).map(([frame, v]) => [`${at}/keyframes/${frame}`, v] as [string, Record<string, unknown>]),
    ];
    for (const [pointer, values] of valueSets) {
      for (const [channel, value] of Object.entries(values ?? {})) {
        if (!REFERENCE_CHANNELS.has(channel) || typeof value !== "string") continue;
        if (!SENTINELS.has(value) && !resources.has(value) && !timelines.has(value)) {
          dangling(`${pointer}/${channel}`, `${channel} ${value} points at nothing`);
        }
      }
    }
  });

  project.templates.forEach((t, i) => {
    walkRefs(t, TEMPLATE_REF_KEYS, `/templates/${i}`, (id, pointer) => {
      if (!SENTINELS.has(id) && !resources.has(id)) dangling(pointer, `${id} is not a resource`);
    });
  });
  if (project.background) {
    walkRefs(project.background, BACKGROUND_REF_KEYS, "/background", (id, pointer) => {
      if (!SENTINELS.has(id) && !resources.has(id)) dangling(pointer, `${id} is not a resource`);
    });
  }

  for (const key of ["view_main_camera", "view_second_camera"]) {
    const v = project.project[key];
    if (typeof v === "string" && !SENTINELS.has(v) && !timelines.has(v)) {
      dangling(`/project/${key}`, `${key} ${v} is not a timeline`);
    }
  }
}
