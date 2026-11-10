// Keyframe rules: frames are canonical whole numbers, known channels have the right type, transitions exist,
// and bend channels are only used where the human rig supports them. Unknown channels are left alone.
import { CANONICAL_FRAME, CHANNELS, TRANSITIONS, humanBendAxes, isHumanPart } from "../format.ts";
import type { Project, Timeline } from "../project.ts";
import type { Report } from "./report.ts";

function checkValues(project: Project, t: Timeline, values: Record<string, unknown>, pointer: string, r: Report): void {
  for (const [channel, value] of Object.entries(values)) {
    const spec = CHANNELS[channel];
    if (!spec) continue;
    const at = `${pointer}/${channel}`;
    switch (spec.kind) {
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) r.error("INVALID_VALUE", at, `${channel} must be a finite number`);
        break;
      case "boolean":
        if (typeof value !== "boolean") r.error("INVALID_VALUE", at, `${channel} must be true or false`);
        break;
      case "color":
        if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value)) r.error("INVALID_VALUE", at, `${channel} must look like #RRGGBB`);
        break;
      case "transition":
        if (typeof value !== "string" || !TRANSITIONS.has(value)) r.error("INVALID_TRANSITION", at, `${String(value)} is not a transition name`);
        break;
    }
    const bend = /^BEND_ANGLE_([XYZ])$/.exec(channel);
    if (bend && isHumanPart(project, t) && !humanBendAxes(t.model_part_name).includes(bend[1] as "X" | "Y" | "Z")) {
      r.error("UNSUPPORTED_BEND", at, `${t.model_part_name} does not bend on ${bend[1]}`);
    }
  }
}

export function checkKeyframes(project: Project, r: Report): void {
  project.timelines.forEach((t, i) => {
    const at = `/timelines/${i}`;
    if (t.default_values !== undefined && (typeof t.default_values !== "object" || t.default_values === null || Array.isArray(t.default_values))) {
      r.error("BAD_SECTION", `${at}/default_values`, "default_values must be an object");
    } else if (t.default_values) {
      checkValues(project, t, t.default_values, `${at}/default_values`, r);
    }
    if (t.keyframes !== undefined && (typeof t.keyframes !== "object" || t.keyframes === null || Array.isArray(t.keyframes))) {
      r.error("BAD_SECTION", `${at}/keyframes`, "keyframes must be an object");
      return;
    }
    for (const [frame, values] of Object.entries(t.keyframes ?? {})) {
      if (!CANONICAL_FRAME.test(frame)) r.error("INVALID_FRAME", `${at}/keyframes/${frame}`, `keyframe "${frame}" is not a whole frame number`);
      if (typeof values !== "object" || values === null || Array.isArray(values)) {
        r.error("BAD_SECTION", `${at}/keyframes/${frame}`, "a keyframe must be an object");
        continue;
      }
      checkValues(project, t, values, `${at}/keyframes/${frame}`, r);
    }
  });
}
