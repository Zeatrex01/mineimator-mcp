// Semantic validation of channel values written by add_keyframe: known channel, right type, allowed range,
// and a timeline that can actually use it.
import { CHANNELS, TRANSITIONS, humanBendAxes, isHumanPart } from "../core/format.ts";
import { MineimatorError } from "../core/errors.ts";
import type { Project, Timeline } from "../core/project.ts";

export type ChannelValue = number | boolean | string;

export function checkChannelValue(project: Project, timeline: Timeline, channel: string, value: ChannelValue): void {
  const spec = CHANNELS[channel];
  if (!spec || !spec.authorable) {
    throw new MineimatorError("UNSUPPORTED_CHANNEL", { channel, reason: "supported: position, rotation, scale, bend, visibility, alpha, colour (RGB_MUL), transitions and camera settings" });
  }
  if (spec.camera && timeline.type !== "camera") {
    throw new MineimatorError("UNSUPPORTED_CHANNEL", { channel, reason: `${timeline.id} is a ${timeline.type}, and this channel belongs to cameras` });
  }
  const invalid = (reason: string) => new MineimatorError("INVALID_VALUE", { channel, reason });

  switch (spec.kind) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) throw invalid("a finite number is required");
      if (spec.min !== undefined && value < spec.min) throw invalid(`must be at least ${spec.min}`);
      if (spec.max !== undefined && value > spec.max) throw invalid(`must be at most ${spec.max}`);
      break;
    case "boolean":
      if (typeof value !== "boolean") throw invalid("true or false is required");
      break;
    case "color":
      if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value)) throw invalid("looks like #RRGGBB");
      break;
    case "transition":
      if (typeof value !== "string" || !TRANSITIONS.has(value)) throw new MineimatorError("INVALID_TRANSITION", { value: String(value) });
      break;
    default:
      throw invalid("not an authorable kind");
  }

  const bend = /^BEND_ANGLE_([XYZ])$/.exec(channel);
  if (bend) {
    const axes = isHumanPart(project, timeline) ? humanBendAxes(timeline.model_part_name) : [];
    if (!axes.includes(bend[1] as "X" | "Y" | "Z")) {
      throw new MineimatorError("UNSUPPORTED_BEND", { timeline: timeline.model_part_name ?? timeline.id, channel });
    }
  }
}
