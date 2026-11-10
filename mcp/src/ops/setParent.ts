// set_parent: move a timeline under another one ("root" = the top level). Simple on purpose: the timeline keeps its own position,
// rotation and scale numbers, which are then read relative to the new parent, so it may jump; the world position is NOT preserved.
// Refused: a timeline into its own subtree, a body part (it belongs to its character), a missing parent.
import { MineimatorError } from "../core/errors.ts";
import { requireTimeline, subtreeOf, type Project } from "../core/project.ts";

export interface SetParentArgs {
  timelineId: string;
  /** A timeline id, or "root". */
  parent: string;
}

export function setParent(project: Project, args: SetParentArgs) {
  const timeline = requireTimeline(project, args.timelineId);
  if (timeline.part_of !== undefined && timeline.part_of !== "null") {
    throw new MineimatorError("INVALID_VALUE", { channel: "timeline_id", reason: `${timeline.id} is a body part of "${timeline.part_of}"; move the character instead` });
  }
  if (args.parent !== "root") {
    requireTimeline(project, args.parent);
    if (subtreeOf(project, timeline.id).some((t) => t.id === args.parent)) {
      throw new MineimatorError("INVALID_VALUE", { channel: "parent", reason: "a timeline cannot be moved into itself or below itself" });
    }
  }
  const before = timeline.parent;
  const siblings = project.timelines.filter((t) => t !== timeline && t.parent === args.parent);
  timeline.parent = args.parent;
  timeline.parent_tree_index = Math.max(0, ...siblings.map((t) => (t.parent_tree_index ?? -1) + 1));
  return { timeline_id: timeline.id, parent: args.parent, previous_parent: before ?? "root" };
}
