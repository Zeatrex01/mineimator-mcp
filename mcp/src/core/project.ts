// The in-memory model of a .miproject file and pure helpers over it. No file access here (see io.ts).
// Unknown fields are always kept: the types name only what the tools touch.
import { MineimatorError } from "./errors.ts";

export type Values = Record<string, unknown>;

export interface Timeline {
  id: string;
  type: string;
  name?: string;
  temp?: string;
  parent?: string;
  parent_tree_index?: number;
  part_of?: string;
  part_root?: string;
  model_part_name?: string;
  parts?: string[];
  hide?: boolean;
  default_values?: Values;
  keyframes?: Record<string, Values>;
  [key: string]: unknown;
}

export interface Template {
  id: string;
  type: string;
  name?: string;
  [key: string]: unknown;
}

export interface Resource {
  id: string;
  type: string;
  filename?: string;
  [key: string]: unknown;
}

export interface Project {
  format: number;
  created_in?: string;
  project: Record<string, unknown>;
  render?: Record<string, unknown>;
  background?: Record<string, unknown>;
  templates: Template[];
  timelines: Timeline[];
  resources: Resource[];
  markers?: unknown[];
  [key: string]: unknown;
}

/** Parse the text of a .miproject. `origin` only decorates error messages. */
export function parseProject(text: string, origin = "project"): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new MineimatorError("INVALID_JSON", { reason: `${origin}: ${(e as Error).message}` });
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new MineimatorError("UNSUPPORTED_FORMAT", { reason: `${origin}: the top level is not an object` });
  }
  const project = data as Project;
  if (typeof project.format !== "number") {
    throw new MineimatorError("UNSUPPORTED_FORMAT", { reason: `${origin}: "format" is missing or not a number` });
  }
  if (typeof project.project !== "object" || project.project === null) {
    throw new MineimatorError("UNSUPPORTED_FORMAT", { reason: `${origin}: "project" section is missing` });
  }
  for (const key of ["templates", "timelines", "resources"] as const) {
    if (!Array.isArray(project[key])) {
      throw new MineimatorError("UNSUPPORTED_FORMAT", { reason: `${origin}: "${key}" is missing or not a list` });
    }
  }
  return project;
}

export function cloneProject(project: Project): Project {
  return structuredClone(project);
}

export function allIds(project: Project): Set<string> {
  return new Set([...project.templates, ...project.timelines, ...project.resources].map((o) => o.id));
}

export function findTimeline(project: Project, id: string): Timeline | undefined {
  return project.timelines.find((t) => t.id === id);
}

export function requireTimeline(project: Project, id: string): Timeline {
  const t = findTimeline(project, id);
  if (!t) throw new MineimatorError("ID_NOT_FOUND", { kind: "timeline", id });
  return t;
}

export function findTemplate(project: Project, id: string | undefined): Template | undefined {
  return id === undefined ? undefined : project.templates.find((t) => t.id === id);
}

export function findResource(project: Project, id: string | undefined): Resource | undefined {
  return id === undefined ? undefined : project.resources.find((r) => r.id === id);
}

/** The timeline and every timeline below it by `parent` or `part_of` (root first). */
export function subtreeOf(project: Project, rootId: string): Timeline[] {
  const root = requireTimeline(project, rootId);
  const seen = new Set<string>([root.id]);
  const order: Timeline[] = [root];
  for (let i = 0; i < order.length; i++) {
    const current = order[i];
    for (const t of project.timelines) {
      if (seen.has(t.id)) continue;
      if (t.parent === current.id || (current.type === "char" && t.part_of === current.id)) {
        seen.add(t.id);
        order.push(t);
      }
    }
  }
  return order;
}

/** The next free order index among the children of `parentId` ("root" for top level). */
export function nextSiblingIndex(project: Project, parentId: string): number {
  const used = project.timelines.filter((t) => t.parent === parentId).map((t) => t.parent_tree_index ?? -1);
  return used.length === 0 ? 0 : Math.max(...used) + 1;
}

/** The effective values of a timeline at frame 0: its defaults overridden by the key at frame 0 (if any). */
export function valuesAtFrameZero(timeline: Timeline): Values {
  return { ...(timeline.default_values ?? {}), ...(timeline.keyframes?.["0"] ?? {}) };
}

export function summarize(project: Project) {
  const count = (items: Array<{ type: string }>) =>
    items.reduce<Record<string, number>>((acc, item) => ((acc[item.type] = (acc[item.type] ?? 0) + 1), acc), {});
  const keyframes = project.timelines.reduce((n, t) => n + Object.keys(t.keyframes ?? {}).length, 0);
  return {
    format: project.format,
    created_in: project.created_in,
    name: project.project.name,
    size: [project.project.video_width, project.project.video_height],
    tempo: project.project.tempo,
    templates: count(project.templates),
    timelines: count(project.timelines),
    resources: count(project.resources),
    keyframes,
  };
}
