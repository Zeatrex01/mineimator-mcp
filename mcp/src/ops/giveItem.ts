// give_item: put a library item into a character's hand. The item becomes a child of the character's right_arm or left_arm
// body part (so it swings with the arm), at ONE fixed offset in the arm's own coordinates: HAND_OFFSET. The offset is a
// reasonable first guess checked once on screen (README "Placement"), not a calibrated grip: use set_pose to move the arm, and
// add_keyframe on the returned item id (POS/ROT/SCA) to adjust. Characters whose model has no such arm part are refused.
import { MineimatorError } from "../core/errors.ts";
import type { LibraryData } from "../core/library.ts";
import { requireTimeline, type Project } from "../core/project.ts";
import { placeProp } from "./placeProp.ts";

/** Item position inside the arm part, scene units (arm part origin = shoulder pivot; the arm hangs 12 units down). */
export const HAND_OFFSET: readonly [number, number, number] = [0, 0, -12];
/** Item rotation inside the arm part, degrees. */
export const HAND_ROTATION: readonly [number, number, number] = [0, 0, 0];

export interface GiveItemArgs {
  characterId: string;
  hand: "right" | "left";
  item: string;
  name?: string;
}

export function giveItem(project: Project, library: LibraryData | null, args: GiveItemArgs) {
  const character = requireTimeline(project, args.characterId);
  if (character.type !== "char") throw new MineimatorError("NOT_CHARACTER", { id: character.id });
  if (args.hand !== "right" && args.hand !== "left") throw new MineimatorError("INVALID_VALUE", { channel: "hand", reason: "right or left" });
  const partName = `${args.hand}_arm`;
  const arm = project.timelines.find((t) => t.part_of === character.id && t.model_part_name === partName);
  if (!arm) throw new MineimatorError("INVALID_VALUE", { channel: "character_id", reason: `${character.id} has no ${partName} body part (try the built-in human)` });
  const placed = placeProp(project, null, library, {
    item: args.item, name: args.name ?? `${args.item}_in_${args.hand}_hand`, parent: arm.id, position: HAND_OFFSET, rotation: HAND_ROTATION,
  });
  return { item_id: placed.root_id, template_id: placed.template_id, hand_part_id: arm.id, hand: args.hand };
}
