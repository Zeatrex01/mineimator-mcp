// place_character: an independent copy of a character rig (root, body parts, template, skin reference) at a position.
// The copy keeps the source's pose at frame 0 as its resting values and drops the source animation.
import { MineimatorError } from "../core/errors.ts";
import type { Project } from "../core/project.ts";
import { cloneTree } from "./cloneTree.ts";
import { locateSource } from "./source.ts";

export interface PlaceCharacterArgs {
  sourceRootId: string;
  name: string;
  position: readonly [number, number, number];
}

export function placeCharacter(project: Project, donor: Project | null, args: PlaceCharacterArgs) {
  if (args.position.length !== 3 || !args.position.every(Number.isFinite)) {
    throw new MineimatorError("INVALID_VALUE", { channel: "position", reason: "three finite numbers [X, Y, Z]" });
  }
  const { doc, timeline } = locateSource(project, donor, args.sourceRootId);
  if (timeline.type !== "char") throw new MineimatorError("NOT_CHARACTER", { id: timeline.id, type: timeline.type });

  const clone = cloneTree(project, doc, timeline.id, { mode: "bake_frame_zero" });
  const root = project.timelines.find((t) => t.id === clone.rootId)!;
  root.name = args.name;
  const [x, y, z] = args.position;
  root.default_values = { ...(root.default_values ?? {}), POS_X: x, POS_Y: y, POS_Z: z };
  return { root_id: clone.rootId, id_map: clone.idMap, part_ids: clone.partIds, warnings: clone.warnings };
}
