// place_prop: put one object into the scene. Three sources:
//   shape  - a built-in cube / cone / cylinder / sphere (needs nothing from the library);
//   block / item - a built-in Minecraft block or item, validated against the installed Mine-imator's library;
//   source_root_id - any non-character timeline subtree of the scene or the donor project (item, block, special block,
//                    scenery, folder...), copied with fresh ids.
// Template layouts are the ones project_save_template.gml writes (checked against the templates in real projects).
import { MineimatorError, warning, type Warning } from "../core/errors.ts";
import { closest, type LibraryData } from "../core/library.ts";
import { newId } from "../core/ids.ts";
import { allIds, findTimeline, requireTimeline, type Project, type Template } from "../core/project.ts";
import { attachTo as attach, newTimeline } from "../core/timelineDefaults.ts";
import { cloneTree } from "./cloneTree.ts";
import { locateSource } from "./source.ts";

/** A block or item is 16 units wide; the app centres it on its position horizontally and puts its bottom at the position's Z. */
export const BLOCK_UNITS = 16;

export const SHAPES = ["cube", "cone", "cylinder", "sphere"] as const;
/** A built-in shape has a radius of 8 units at scale 1 (temp_update_shape.gml, rad = 8): 16 units across, one block. */
export const SHAPE_UNITS = 16;

export interface PlacePropArgs {
  name?: string;
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  /** Multiplier on all axes, or per axis. */
  scale?: number | readonly [number, number, number];
  /** Shapes only: width in scene units (diameter of a sphere); sets the scale. */
  size?: number;
  /** "#RRGGBB", multiplied over the texture (a shape has none, so this is its colour). */
  color?: string;
  /** Attach under this timeline; position is then relative to it. */
  parent?: string;
  shape?: string;
  block?: string;
  state?: Record<string, string>;
  item?: string;
  sourceRootId?: string;
  /**
   * Blocks only. Where `position` is on the block: "bottom_center" (default, what Mine-imator itself does: the block spans
   * position +-8 in X and Y, and from position Z up 16) or "corner" (position is the block's minimum X, Y, bottom corner).
   */
  anchor?: "bottom_center" | "corner";
  /** Copy mode only: keep the source's keyframes (default: bake frame 0 and drop the animation, like place_character). */
  keepAnimation?: boolean;
}

const invalid = (channel: string, reason: string) => new MineimatorError("INVALID_VALUE", { channel, reason });

function vector(channel: string, v: readonly number[] | undefined): void {
  if (v !== undefined && (v.length !== 3 || !v.every(Number.isFinite))) throw invalid(channel, "three finite numbers [X, Y, Z]");
}

function shapeTemplate(project: Project, type: string): Template {
  return {
    id: newId(allIds(project)), type, name: "",
    shape: {
      tex: "null", tex_material: "null", tex_normal: "null", tex_mapped: false, tex_hoffset: 0, tex_voffset: 0, tex_hrepeat: 1, tex_vrepeat: 1,
      tex_hmirror: false, tex_vmirror: false, closed: true, invert: false, detail: 32, face_camera: false,
    },
  };
}

export function blockTemplate(project: Project, library: LibraryData | null, name: string, state: Record<string, string> | undefined): Template {
  if (!library) throw new MineimatorError("LIBRARY_NOT_CONFIGURED");
  const block = library.blocks.get(name);
  if (!block) throw new MineimatorError("LIBRARY_ENTRY_NOT_FOUND", { kind: "block", name, near: closest(library.blocks.keys(), name).join(", ") || "call list_library kind blocks" });
  const chosen = new Map(block.defaultState);
  for (const [key, value] of Object.entries(state ?? {})) {
    const allowed = block.states[key];
    if (!allowed) throw new MineimatorError("LIBRARY_STATE_INVALID", { name, state: key, reason: `unknown state; known: ${Object.keys(block.states).join(", ") || "none"}` });
    if (!allowed.includes(value)) throw new MineimatorError("LIBRARY_STATE_INVALID", { name, state: key, reason: `"${value}" is not one of: ${allowed.join(", ")}` });
    chosen.set(key, value);
  }
  return {
    id: newId(allIds(project)), type: "block", name: "",
    block: {
      name, state: Object.fromEntries(chosen), tex: "default", tex_material: "default", tex_normal: "default",
      randomize: true, repeat_enable: false, repeat: [1, 1, 1],
    },
  };
}

function itemTemplate(project: Project, library: LibraryData | null, name: string): Template {
  if (!library) throw new MineimatorError("LIBRARY_NOT_CONFIGURED");
  // The list holds full texture names ("item/bread", but also "trims/items/helmet_trim"); the short form means "item/<name>".
  const full = name !== "" && library.items.includes(name) ? name : `item/${name}`;
  if (name === "" || !library.items.includes(full)) {
    const near = closest(library.items.filter((i) => i !== ""), name.replace(/^item\//, ""));
    throw new MineimatorError("LIBRARY_ENTRY_NOT_FOUND", { kind: "item", name, near: near.join(", ") || "call list_library kind items" });
  }
  return {
    id: newId(allIds(project)), type: "item", name: "",
    item: { tex: "default", tex_material: "default", tex_normal: "default", name: full, "3d": true, face_camera: false, bounce: false, spin: false },
  };
}

/** Position, rotation, scale and colour become the new timeline's resting values. */
function restingValues(args: PlacePropArgs): Record<string, number | string> {
  const values: Record<string, number | string> = {};
  const [px, py, z] = args.position ?? [0, 0, 0];
  const shift = args.anchor === "corner" ? BLOCK_UNITS / 2 : 0;
  const [x, y] = [px + shift, py + shift];
  Object.assign(values, { POS_X: x, POS_Y: y, POS_Z: z });
  if (args.rotation) Object.assign(values, { ROT_X: args.rotation[0], ROT_Y: args.rotation[1], ROT_Z: args.rotation[2] });
  let scale = args.scale;
  if (args.size !== undefined) scale = args.size / SHAPE_UNITS;
  if (scale !== undefined) {
    const [sx, sy, sz] = typeof scale === "number" ? [scale, scale, scale] : scale;
    Object.assign(values, { SCA_X: sx, SCA_Y: sy, SCA_Z: sz });
  }
  if (args.color !== undefined) values.RGB_MUL = args.color.toUpperCase();
  return values;
}

export function placeProp(project: Project, donor: Project | null, library: LibraryData | null, args: PlacePropArgs) {
  const sources = [args.shape, args.block, args.item, args.sourceRootId].filter((s) => s !== undefined);
  if (sources.length !== 1) throw invalid("source", "give exactly one of shape, block, item or source_root_id");
  vector("position", args.position);
  vector("rotation", args.rotation);
  if (Array.isArray(args.scale)) vector("scale", args.scale);
  else if (args.scale !== undefined && !(typeof args.scale === "number" && Number.isFinite(args.scale))) throw invalid("scale", "a number or [X, Y, Z]");
  if (args.size !== undefined && (args.shape === undefined || !(args.size > 0))) throw invalid("size", "a positive width in scene units, for shapes only");
  if (args.size !== undefined && args.scale !== undefined) throw invalid("size", "give size or scale, not both");
  if (args.anchor !== undefined && args.anchor !== "bottom_center" && args.anchor !== "corner") throw invalid("anchor", "bottom_center or corner");
  if (args.anchor === "corner" && args.block === undefined) throw invalid("anchor", "corner applies to blocks only");
  if (args.color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(args.color)) throw invalid("color", "looks like #RRGGBB");
  if (args.parent !== undefined) requireTimeline(project, args.parent);

  const warnings: Warning[] = [];

  if (args.sourceRootId !== undefined) {
    const { doc, timeline } = locateSource(project, donor, args.sourceRootId);
    if (timeline.type === "char") throw new MineimatorError("PROP_UNSUPPORTED", { id: timeline.id, reason: "it is a character; use place_character" });
    if (timeline.type === "camera") throw new MineimatorError("PROP_UNSUPPORTED", { id: timeline.id, reason: "it is a camera; use set_camera" });
    if (timeline.part_of !== undefined && timeline.part_of !== "null") {
      throw new MineimatorError("PROP_UNSUPPORTED", {
        id: timeline.id,
        reason: `it is a part of "${timeline.part_of}" (for example one block inside a scenery or a body part); copy the whole object with place_set, or create the block with place_prop block`,
      });
    }
    const clone = cloneTree(project, doc, timeline.id, { mode: args.keepAnimation ? "keep_animation" : "bake_frame_zero" });
    warnings.push(...clone.warnings);
    const root = findTimeline(project, clone.rootId)!;
    if (args.name !== undefined) root.name = args.name;
    const rest = restingValues(args);
    const wanted: Record<string, number | string> = {};
    if (args.position) Object.assign(wanted, { POS_X: rest.POS_X, POS_Y: rest.POS_Y, POS_Z: rest.POS_Z });
    for (const k of ["ROT_X", "ROT_Y", "ROT_Z", "SCA_X", "SCA_Y", "SCA_Z", "RGB_MUL"]) if (k in rest) wanted[k] = rest[k];
    root.default_values = { ...(root.default_values ?? {}), ...wanted };
    if (args.keepAnimation && Object.values(root.keyframes ?? {}).some((k) => Object.keys(k).some((c) => c in wanted))) {
      warnings.push(warning("PROP_VALUES_KEYED", { id: root.id }));
    }
    attach(project, root, args.parent);
    return { root_id: clone.rootId, template_id: root.temp ?? null, source: "copy", id_map: clone.idMap, warnings };
  }

  let template: Template;
  let type: string;
  if (args.shape !== undefined) {
    if (!(SHAPES as readonly string[]).includes(args.shape)) throw invalid("shape", `one of ${SHAPES.join(", ")}`);
    type = args.shape;
    template = shapeTemplate(project, type);
  } else if (args.block !== undefined) {
    type = "block";
    template = blockTemplate(project, library, args.block, args.state);
  } else {
    type = "item";
    template = itemTemplate(project, library, args.item!);
  }

  project.templates.push(template); // first, so the timeline's fresh id cannot equal the template's
  const timeline = newTimeline(project, type, { name: args.name, temp: template.id });
  timeline.default_values = restingValues(args);
  project.timelines.push(timeline);
  attach(project, timeline, args.parent);
  return { root_id: timeline.id, template_id: template.id, source: "library", warnings };
}
