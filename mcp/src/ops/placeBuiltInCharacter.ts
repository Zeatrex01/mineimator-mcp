// place_character with a library model: create the template and the body-part timelines the way Mine-imator does when
// a character, mob or special block is added from its library (action_bench_create.gml -> temp_duplicate + temp_animate.gml):
//   1. a template {type char|spblock, model:{name, state, model_version}, model_tex... "default"};
//   2. a root timeline of that template (temp_animate.gml, case CHARACTER / SPECIAL_BLOCK);
//   3. one body-part timeline per model part that is not hidden, created in the order of the model file's flat part
//      list, which is POST-order (children before their parent; model_file_load_part.gml adds a part to
//      file_part_list after its children) - tl_new_part.gml, and the root's parts[] keeps that order;
//   4. each part is moved under its parent part, top-level parts stay under the root, in file order
//      (tl_update_part_list.gml). The children of a hidden part are not moved: they stay under the root.
import { newId } from "../core/ids.ts";
import { MineimatorError } from "../core/errors.ts";
import type { ModelPart, ResolvedModel } from "../core/library.ts";
import { allIds, nextSiblingIndex, type Project, type Template, type Timeline } from "../core/project.ts";
import { newTimeline } from "../core/timelineDefaults.ts";

export interface PlaceBuiltInCharacterArgs {
  name: string;
  position: readonly [number, number, number];
  /** Turn about Z in degrees. 0 faces +Y (see README "Placement"); 180 faces -Y. +90 turns it to face +X. */
  rotationZ?: number;
}

export function placeBuiltInCharacter(project: Project, model: ResolvedModel, args: PlaceBuiltInCharacterArgs) {
  if (args.position.length !== 3 || !args.position.every(Number.isFinite)) {
    throw new MineimatorError("INVALID_VALUE", { channel: "position", reason: "three finite numbers [X, Y, Z]" });
  }
  const isCharacter = model.kind === "character";
  const hidden = new Set(model.hidden);

  const template: Template = {
    id: newId(allIds(project)),
    type: isCharacter ? "char" : "spblock",
    name: "",
    model_tex: "default",
    model_tex_material: "default",
    model_tex_normal: "default",
    model_use_blend_color: false,
    model_blend_color: "#FFFFFF",
    model: { name: model.name, state: Object.fromEntries(model.state), model_version: model.version },
  };

  const root = newTimeline(project, isCharacter ? "char" : "spblock", { name: args.name, temp: template.id });
  const [x, y, z] = args.position;
  if (args.rotationZ !== undefined && !Number.isFinite(args.rotationZ)) throw new MineimatorError("INVALID_VALUE", { channel: "rotation_z", reason: "a number of degrees" });
  root.default_values = { POS_X: x, POS_Y: y, POS_Z: z, ...(args.rotationZ ? { ROT_Z: args.rotationZ } : {}) };

  // 3. create the part timelines in post-order
  const created = new Map<string, Timeline>();
  const tree = new Map<string, string[]>([[root.id, []]]);
  const taken = allIds(project);
  taken.add(template.id);
  taken.add(root.id);
  const create = (parts: ModelPart[]) => {
    for (const part of parts) {
      create(part.parts);
      if (hidden.has(part.name)) continue;
      const timeline = newTimeline(project, "bodypart", { temp: template.id, bodyPart: true, parent: root.id });
      timeline.id = newId(taken);
      Object.assign(timeline, { model_part_name: part.name, part_of: root.id, depth: part.depth, lock_bend: part.lockBend, backfaces: part.backfaces });
      created.set(part.name, timeline);
      tree.set(timeline.id, []);
      tree.get(root.id)!.push(timeline.id);
    }
  };
  create(model.parts);
  root.parts = [...created.values()].map((t) => t.id);

  // 4. move parts under their parents
  const parentOf = new Map<string, string>([...created.values()].map((t) => [t.id, root.id]));
  const reparent = (parts: ModelPart[], parentId: string) => {
    for (const part of parts) {
      const timeline = created.get(part.name);
      if (!timeline) continue; // hidden: its children stay where they are
      const old = tree.get(parentOf.get(timeline.id)!)!;
      old.splice(old.indexOf(timeline.id), 1);
      tree.get(parentId)!.push(timeline.id);
      parentOf.set(timeline.id, parentId);
      reparent(part.parts, timeline.id);
    }
  };
  reparent(model.parts, root.id);

  for (const timeline of created.values()) {
    timeline.parent = parentOf.get(timeline.id)!;
    timeline.parent_tree_index = tree.get(timeline.parent)!.indexOf(timeline.id);
  }
  root.parent_tree_index = nextSiblingIndex(project, "root");

  project.templates.push(template);
  project.timelines.push(root, ...created.values());
  const partIds = Object.fromEntries([...created].map(([name, t]) => [name, t.id]));
  return {
    root_id: root.id,
    template_id: template.id,
    part_ids: partIds,
    state: Object.fromEntries(model.state),
    hidden_parts: model.hidden,
  };
}
