// place_set: bring a set (a folder of scenery, a prop, a model...) from the donor project into the scene, animation
// and position included. Characters are copied with place_character instead, so their pose is baked.
import { MineimatorError } from "../core/errors.ts";
import type { Project } from "../core/project.ts";
import { cloneTree } from "./cloneTree.ts";
import { locateSource } from "./source.ts";

export interface PlaceSetArgs {
  sourceRootId: string;
}

export function placeSet(project: Project, donor: Project | null, args: PlaceSetArgs) {
  const { doc, timeline } = locateSource(project, donor, args.sourceRootId);
  if (timeline.type === "char") throw new MineimatorError("INVALID_VALUE", { channel: "source_root_id", reason: "this is a character; use place_character" });
  const clone = cloneTree(project, doc, timeline.id, { mode: "keep_animation" });
  return { root_id: clone.rootId, id_map: clone.idMap, warnings: clone.warnings };
}
