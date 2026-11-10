// Facts about the .miproject format (v34) that several layers share: transitions, channels, rig naming.
// Each fact was checked against the Mine-imator source and a set of real projects.
import type { Project, Template, Timeline } from "./project.ts";

export const SUPPORTED_FORMAT = 34;

export const TRANSITIONS: ReadonlySet<string> = new Set([
  "linear",
  "instant",
  "bezier",
  ...["easein", "easeout", "easeinout"].flatMap((ease) =>
    ["quad", "cubic", "quart", "quint", "sine", "expo", "circ", "elastic", "back", "bounce"].map((curve) => ease + curve),
  ),
]);

export type ChannelKind = "number" | "boolean" | "string" | "color" | "transition";

export interface ChannelSpec {
  kind: ChannelKind;
  min?: number;
  max?: number;
  /** Only meaningful on camera timelines. */
  camera?: boolean;
  /** Accepted by add_keyframe. */
  authorable: boolean;
}

const AXES = ["X", "Y", "Z"] as const;
const num = (extra: Partial<ChannelSpec> = {}): ChannelSpec => ({ kind: "number", authorable: true, ...extra });

export const CHANNELS: Record<string, ChannelSpec> = {
  ...Object.fromEntries(AXES.map((a) => [`POS_${a}`, num()])),
  ...Object.fromEntries(AXES.map((a) => [`ROT_${a}`, num()])),
  ...Object.fromEntries(AXES.map((a) => [`SCA_${a}`, num()])),
  ...Object.fromEntries(AXES.map((a) => [`BEND_ANGLE_${a}`, num()])),
  VISIBLE: { kind: "boolean", authorable: true },
  ALPHA: num({ min: 0, max: 1 }),
  TRANSITION: { kind: "transition", authorable: true },
  EASE_IN_X: num(),
  EASE_IN_Y: num(),
  EASE_OUT_X: num(),
  EASE_OUT_Y: num(),
  RGB_MUL: { kind: "color", authorable: true },
  CAM_FOV: num({ min: 1, max: 170, camera: true }),
  CAM_SIZE_USE_PROJECT: { kind: "boolean", camera: true, authorable: true },
  CAM_SIZE_KEEP_ASPECT_RATIO: { kind: "boolean", camera: true, authorable: true },
  CAM_WIDTH: num({ min: 1, camera: true }),
  CAM_HEIGHT: num({ min: 1, camera: true }),
  CAM_ROTATE: { kind: "boolean", camera: true, authorable: true },
  CAM_SHAKE: { kind: "boolean", camera: true, authorable: true },
  CAM_DOF: { kind: "boolean", camera: true, authorable: true },
  CAM_BLOOM: { kind: "boolean", camera: true, authorable: true },
  CAM_ROTATE_DISTANCE: num({ camera: true }),
  CAM_DOF_RANGE: num({ camera: true }),
};

/** Channels whose value is the id of another object. They must be remapped when a subtree is copied. */
export const REFERENCE_CHANNELS: ReadonlySet<string> = new Set([
  "IK_TARGET", "IK_TARGET_ANGLE", "PATH_OBJ", "TEXTURE_OBJ", "TEXTURE_MATERIAL_OBJ", "TEXTURE_NORMAL_OBJ",
  "SOUND_OBJ", "TEXT_FONT", "ATTRACTOR",
]);

/** Channels that describe how a key blends into the next one, not a pose value. */
export const CURVE_CHANNELS: ReadonlySet<string> = new Set(["TRANSITION", "EASE_IN_X", "EASE_IN_Y", "EASE_OUT_X", "EASE_OUT_Y"]);

export type Axis = "X" | "Y" | "Z";

/**
 * Bend axes a human-rig part supports (checked in the installed model files and in real projects:
 * the body bends on X/Y/Z, arms and legs on X, head and hat do not bend).
 */
export function humanBendAxes(partName: string | undefined): readonly Axis[] {
  if (partName === "body") return ["X", "Y", "Z"];
  if (partName === "right_arm" || partName === "left_arm" || partName === "right_leg" || partName === "left_leg") return ["X"];
  return [];
}

export function isHumanTemplate(template: Template | undefined): boolean {
  const model = template?.model as { name?: string } | undefined;
  return template?.type === "char" && model?.name === "human";
}

/** Rig id such as "human/wide/steve@1", derived from a character template. Undefined for custom models. */
export function rigIdOf(template: Template | undefined): string | undefined {
  const model = template?.model as { name?: string; state?: { type?: string; variant?: string }; model_version?: number } | undefined;
  if (!model || typeof model !== "object" || !model.name) return undefined;
  return `${model.name}/${model.state?.type ?? "default"}/${model.state?.variant ?? "default"}@${model.model_version ?? 0}`;
}

/** Whether a timeline is a part of a human character (so bend rules are known for it). */
export function isHumanPart(project: Project, timeline: Timeline): boolean {
  if (timeline.type !== "bodypart" || !timeline.temp) return false;
  return isHumanTemplate(project.templates.find((t) => t.id === timeline.temp));
}

export const CANONICAL_FRAME = /^(0|[1-9]\d*)$/;
