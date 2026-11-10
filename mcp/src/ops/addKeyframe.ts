// add_keyframe: set channels on one timeline at one frame.
// A key starts from the timeline's default values, not from the previous key: channels you leave out reset.
import { MineimatorError } from "../core/errors.ts";
import { requireTimeline, type Project } from "../core/project.ts";
import { checkChannelValue, type ChannelValue } from "./channels.ts";

export interface AddKeyframeArgs {
  timelineId: string;
  frame: number;
  values: Record<string, ChannelValue>;
}

export function addKeyframe(project: Project, args: AddKeyframeArgs) {
  if (!Number.isInteger(args.frame) || args.frame < 0) {
    throw new MineimatorError("INVALID_VALUE", { channel: "frame", reason: "a whole number of frames, 0 or more" });
  }
  const timeline = requireTimeline(project, args.timelineId);
  const entries = Object.entries(args.values);
  if (entries.length === 0) throw new MineimatorError("INVALID_VALUE", { channel: "values", reason: "at least one channel is required" });
  for (const [channel, value] of entries) checkChannelValue(project, timeline, channel, value);

  timeline.keyframes ??= {};
  const key = (timeline.keyframes[String(args.frame)] ??= {});
  for (const [channel, value] of entries) key[channel] = value;
  return { timeline_id: timeline.id, frame: args.frame, changed_keys: entries.map(([channel]) => channel) };
}
