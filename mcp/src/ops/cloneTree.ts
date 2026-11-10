// Copy a timeline and everything below it from one project into another (or into the same one) with fresh ids.
// Shared by place_character (bakes the pose at frame 0, drops the animation) and place_set (keeps the animation).
//
// What is rewritten, exactly: the typed id fields of a timeline (temp, parent, part_of, part_root, parts), the id-valued
// channels in its values (TEXTURE_OBJ, ATTRACTOR, ...), and every resource id that appears as a whole string inside a
// copied template. Nothing is searched and replaced inside longer strings. After rewriting, any leftover reference to
// an object of the source project fails the copy instead of producing a half-linked rig.
import { isDeepStrictEqual } from "node:util";
import { MineimatorError, warning, type Warning } from "../core/errors.ts";
import { CURVE_CHANNELS, REFERENCE_CHANNELS } from "../core/format.ts";
import { newId, SENTINELS } from "../core/ids.ts";
import {
  allIds, findResource, nextSiblingIndex, subtreeOf, valuesAtFrameZero,
  type Project, type Resource, type Template, type Timeline, type Values,
} from "../core/project.ts";

export interface CloneOptions {
  /** "bake_frame_zero": keep the pose at frame 0 as the new defaults and drop all keys. "keep_animation": copy keys as they are. */
  mode: "bake_frame_zero" | "keep_animation";
}

export interface CloneResult {
  rootId: string;
  idMap: Record<string, string>;
  /** model_part_name -> new id, for the parts of the copied character. */
  partIds: Record<string, string>;
  warnings: Warning[];
}

function* strings(value: unknown, skipKeys: ReadonlySet<string> = new Set()): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const v of value) yield* strings(v, skipKeys);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (!skipKeys.has(k)) yield* strings(v, skipKeys);
  }
}

export function cloneTree(target: Project, source: Project, sourceRootId: string, options: CloneOptions): CloneResult {
  const subtree = subtreeOf(source, sourceRootId);
  const sourceTimelineIds = new Set(source.timelines.map((t) => t.id));
  const taken = new Set([...allIds(target), ...allIds(source)]);
  const warnings: Warning[] = [];

  const idMap: Record<string, string> = {};
  for (const t of subtree) idMap[t.id] = newId(taken);

  const external = (id: string, targetId: string) => new MineimatorError("EXTERNAL_RIG_LINK", { id, target: targetId });

  // --- resources: reuse an identical one, copy a missing one, re-id a clashing one
  const resourceMap = new Map<string, string>();
  const newResources: Resource[] = [];
  const ensureResource = (sourceId: string): string => {
    const known = resourceMap.get(sourceId);
    if (known) return known;
    const original = findResource(source, sourceId)!;
    const existing = findResource(target, sourceId) ?? newResources.find((r) => r.id === sourceId);
    let mapped = sourceId;
    if (!existing) {
      newResources.push(structuredClone(original));
    } else if (!isDeepStrictEqual(existing, original)) {
      mapped = newId(taken);
      newResources.push({ ...structuredClone(original), id: mapped });
    }
    resourceMap.set(sourceId, mapped);
    return mapped;
  };
  const remapResource = (value: string): string => (findResource(source, value) ? ensureResource(value) : value);

  // --- templates: always cloned with a new id
  const templateMap = new Map<string, string>();
  const newTemplates: Template[] = [];
  const ensureTemplate = (sourceId: string): string => {
    const known = templateMap.get(sourceId);
    if (known) return known;
    const copy = structuredClone(source.templates.find((t) => t.id === sourceId)!);
    copy.id = newId(taken);
    const rewrite = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach((v, i) => (typeof v === "string" ? (node[i] = remapResource(v)) : rewrite(v)));
      else if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
          if (k === "id") continue;
          if (typeof v === "string") obj[k] = remapResource(v);
          else rewrite(v);
        }
      }
    };
    rewrite(copy);
    templateMap.set(sourceId, copy.id);
    newTemplates.push(copy);
    return copy.id;
  };

  const mapTimelineRef = (holder: string, ref: string | undefined): string | undefined => {
    if (ref === undefined || SENTINELS.has(ref)) return ref;
    if (idMap[ref]) return idMap[ref];
    if (sourceTimelineIds.has(ref)) throw external(holder, ref);
    return ref;
  };

  const mapValues = (holder: string, values: Values): Values => {
    const out: Values = { ...values };
    for (const [channel, value] of Object.entries(out)) {
      if (!REFERENCE_CHANNELS.has(channel) || typeof value !== "string" || SENTINELS.has(value)) continue;
      if (idMap[value]) out[channel] = idMap[value];
      else if (findResource(source, value)) out[channel] = ensureResource(value);
      else if (sourceTimelineIds.has(value)) throw external(holder, value);
    }
    return out;
  };

  const clones: Timeline[] = subtree.map((t) => {
    const c = structuredClone(t);
    c.id = idMap[t.id];
    if (t.temp !== undefined) {
      if (source.templates.some((x) => x.id === t.temp)) c.temp = ensureTemplate(t.temp);
      else c.temp = mapTimelineRef(t.id, t.temp);
    }
    if (t.id === sourceRootId) {
      c.parent = "root";
    } else {
      c.parent = mapTimelineRef(t.id, t.parent);
    }
    if (t.part_of !== undefined) c.part_of = mapTimelineRef(t.id, t.part_of);
    if (t.part_root !== undefined) c.part_root = mapTimelineRef(t.id, t.part_root);
    if (t.parts) c.parts = t.parts.map((p) => mapTimelineRef(t.id, p)!);

    if (options.mode === "bake_frame_zero") {
      const firstKey = Object.keys(t.keyframes ?? {}).map(Number).sort((a, b) => a - b)[0];
      if (firstKey !== undefined && firstKey > 0) warnings.push(warning("FIRST_KEY_AFTER_ZERO", { id: t.id, frame: firstKey }));
      const baked: Values = {};
      for (const [channel, v] of Object.entries(valuesAtFrameZero(t))) if (!CURVE_CHANNELS.has(channel)) baked[channel] = v;
      c.default_values = mapValues(t.id, baked);
      c.keyframes = {};
    } else {
      c.default_values = mapValues(t.id, t.default_values ?? {});
      c.keyframes = Object.fromEntries(Object.entries(t.keyframes ?? {}).map(([f, v]) => [f, mapValues(t.id, v)]));
    }
    return c;
  });

  // Leftover references to objects of the source project mean a field this code does not know how to link.
  for (const c of clones) {
    for (const s of strings(c, new Set(["id"]))) {
      if (sourceTimelineIds.has(s)) throw external(c.id, s); // new ids are never source ids, so this is a leftover
    }
  }

  const root = clones.find((c) => c.id === idMap[sourceRootId])!;
  root.parent_tree_index = nextSiblingIndex(target, "root");

  target.templates.push(...newTemplates);
  target.resources.push(...newResources);
  target.timelines.push(...clones);

  const partIds: Record<string, string> = {};
  for (const c of clones) if (c.part_of === root.id && c.model_part_name) partIds[c.model_part_name] = c.id;
  return { rootId: root.id, idMap, partIds, warnings };
}
