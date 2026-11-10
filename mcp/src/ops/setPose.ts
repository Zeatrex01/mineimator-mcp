// set_pose: write a named pose from a pose library onto a character at one frame.
// A pose is written as COMPLETE keys: every owned channel of every listed part is set explicitly (zero when the pose
// says nothing), because a key that omits a channel falls back to the timeline default, not to the previous pose.
import { MineimatorError } from "../core/errors.ts";
import { rigIdOf, humanBendAxes } from "../core/format.ts";
import type { PoseLibrary } from "../core/poseLibrary.ts";
import { findTemplate, requireTimeline, type Project } from "../core/project.ts";

export interface SetPoseArgs {
  rootId: string;
  frame: number;
  pose: string;
}

export function setPose(project: Project, libraries: readonly PoseLibrary[], args: SetPoseArgs) {
  if (!Number.isInteger(args.frame) || args.frame < 0) {
    throw new MineimatorError("INVALID_VALUE", { channel: "frame", reason: "a whole number of frames, 0 or more" });
  }
  const root = requireTimeline(project, args.rootId);
  if (root.type !== "char") throw new MineimatorError("NOT_CHARACTER", { id: root.id, type: root.type });

  const rig = rigIdOf(findTemplate(project, root.temp));
  if (!rig) throw new MineimatorError("RIG_MISMATCH", { rig: "unknown", reason: "the character's template has no model" });
  const library = libraries.find((l) => l.rig === rig);
  if (!library) {
    throw new MineimatorError("RIG_MISMATCH", { rig, reason: `libraries available for: ${libraries.map((l) => l.rig).join(", ") || "none"}` });
  }
  const pose = library.poses[args.pose];
  if (!pose) throw new MineimatorError("POSE_NOT_FOUND", { pose: args.pose, known: Object.keys(library.poses).join(", ") });

  const partIds: Record<string, string> = {};
  for (const partName of Object.keys(library.base)) {
    const part = project.timelines.find((t) => t.part_of === root.id && t.model_part_name === partName);
    if (!part) throw new MineimatorError("RIG_MISMATCH", { rig, reason: `the character has no part named ${partName}` });
    partIds[partName] = part.id;
  }

  for (const [partName, id] of Object.entries(partIds)) {
    const part = project.timelines.find((t) => t.id === id)!;
    const bendAxes = rig.startsWith("human/") ? humanBendAxes(partName) : null; // null: trust the library
    const key: Record<string, unknown> = {};
    for (const channel of library.owned_channels) {
      const bend = /^BEND_ANGLE_([XYZ])$/.exec(channel);
      if (bend && bendAxes && !bendAxes.includes(bend[1] as "X" | "Y" | "Z")) continue; // never write an unsupported bend, even 0
      key[channel] = pose.parts[partName]?.[channel] ?? library.base[partName]?.[channel] ?? library.missing_owned_value;
    }
    key.TRANSITION = pose.transition;
    part.keyframes ??= {};
    part.keyframes[String(args.frame)] = { ...(part.keyframes[String(args.frame)] ?? {}), ...key };
  }
  return { part_ids: partIds, frame: args.frame, pose: args.pose };
}
