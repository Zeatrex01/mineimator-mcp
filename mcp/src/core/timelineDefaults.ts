// The fields Mine-imator 2.0.2 writes for a timeline it has just created, per type.
// Source: project_save_timeline.gml (which groups are written for which type) and tl_new_part.gml / temp_animate.gml
// (the inherit flags and creation defaults of body parts); the values equal those in real projects.
import { allIds, nextSiblingIndex, requireTimeline, type Project, type Timeline } from "./project.ts";
import { newId } from "./ids.ts";

const TYPES_WITH_WIND: ReadonlySet<string> = new Set(["scenery", "block", "particles", "text", "cube", "cone", "cylinder", "sphere", "surface"]);
const TYPES_WITHOUT_ROT_POINT: ReadonlySet<string> = new Set(["particles"]);

export interface NewTimelineFields {
  name?: string;
  temp?: string;
  /** "root" for the top level, or the id of another timeline. */
  parent?: string;
  /** Body parts of a rig: a part inherits alpha, colour, texture and rotation point and does not resize with its parent. */
  bodyPart?: boolean;
  [key: string]: unknown;
}

/** Create a timeline of `type`, give it a fresh id and attach it as the last child of `parent` (default "root"). Not added to the project. */
export function newTimeline(project: Project, type: string, fields: NewTimelineFields = {}): Timeline {
  const { name, temp, parent, bodyPart, ...rest } = fields;
  const parentId = parent ?? "root";
  const timeline: Timeline = {
    id: newId(allIds(project)),
    type,
    name: name ?? "",
    temp: temp ?? "null",
    color_tag: "null",
    hide: false,
    lock: false,
    ghost: false,
    depth: 0,
    default_values: {},
    keyframes: {},
    parent: parentId,
    parent_tree_index: nextSiblingIndex(project, parentId),
    lock_bend: true,
    tree_extend: false,
    inherit: {
      position: true, rotation: true, scale: true, alpha: bodyPart === true, color: bodyPart === true, texture: bodyPart === true,
      surface: true, subsurface: true, visibility: true, bend: false, rot_point: bodyPart === true, glow_color: true, select: false, pose: false,
    },
    scale_resize: bodyPart !== true,
  };
  if (!TYPES_WITHOUT_ROT_POINT.has(type)) {
    timeline.rot_point_custom = false;
    timeline.rot_point = [0, 0, 0];
  }
  Object.assign(timeline, {
    backfaces: type === "surface",
    texture_blur: false,
    texture_filtering: type === "block" || type === "scenery",
    shadows: true,
    ssao: type !== "particles",
    glow: false,
    glow_texture: true,
    only_render_glow: false,
    glint_mode: 0,
    glint_scale: 1,
    glint_speed: 1,
    glint_strength: 1,
    glint_tex: "default",
    fog: true,
    ...(TYPES_WITH_WIND.has(type) ? { wind: false, wind_terrain: true } : {}),
    hq_hiding: false,
    lq_hiding: false,
    blend_mode: "normal",
    alpha_mode: 2,
  });
  return Object.assign(timeline, rest);
}

/** Make `timeline` the last child of `parent`; undefined keeps its parent. Positions are then relative to the parent. */
export function attachTo(project: Project, timeline: Timeline, parent: string | undefined): void {
  if (parent === undefined) return;
  requireTimeline(project, parent);
  const index = nextSiblingIndex(project, parent); // before the move, so the timeline does not count itself
  timeline.parent = parent;
  timeline.parent_tree_index = index;
}
