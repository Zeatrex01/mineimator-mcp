// animate_path: keys that move one timeline through a list of points, built on add_keyframe.
// Between two points Mine-imator eases with the transition stored on the key it starts from (tl_update_values.gml), so the
// transition of point i is the one written on key i. A key resets every channel it does not name to the timeline's resting
// values, so the move only writes position (and the spin axis); everything else stays at the resting values.
import { MineimatorError } from "../core/errors.ts";
import { TRANSITIONS } from "../core/format.ts";
import { requireTimeline, type Project } from "../core/project.ts";
import { addKeyframe } from "./addKeyframe.ts";

export interface PathPoint {
  frame: number;
  position: readonly [number, number, number];
  /** Transition for the move that starts at this point. */
  transition?: string;
}

export interface Spin {
  axis: "X" | "Y" | "Z";
  /** Total turn over the whole path, shared out along it by distance. */
  totalDegrees?: number;
  /** Turn per scene unit travelled: a ball of radius r rolls 180 / (pi * r) degrees per unit. */
  degreesPerUnit?: number;
}

export interface AnimatePathArgs {
  timelineId: string;
  points: readonly PathPoint[];
  /** Default transition of every move (default linear). */
  transition?: string;
  spin?: Spin;
}

const bad = (reason: string) => new MineimatorError("PATH_INVALID", { reason });

export function animatePath(project: Project, args: AnimatePathArgs) {
  const timeline = requireTimeline(project, args.timelineId);
  const { points } = args;
  if (points.length < 2) throw bad("it needs at least two points");
  points.forEach((p, i) => {
    if (!Number.isInteger(p.frame) || p.frame < 0) throw bad(`point ${i + 1} has no whole frame number`);
    if (i > 0 && p.frame <= points[i - 1].frame) throw bad(`point ${i + 1} must come after point ${i}`);
    if (p.position.length !== 3 || !p.position.every(Number.isFinite)) throw bad(`point ${i + 1} needs a position [X, Y, Z]`);
    if (p.transition !== undefined && !TRANSITIONS.has(p.transition)) throw new MineimatorError("INVALID_TRANSITION", { value: p.transition });
  });
  if (args.transition !== undefined && !TRANSITIONS.has(args.transition)) throw new MineimatorError("INVALID_TRANSITION", { value: args.transition });
  const spin = args.spin;
  if (spin && (spin.totalDegrees === undefined) === (spin.degreesPerUnit === undefined)) throw bad("spin needs exactly one of total_degrees or degrees_per_unit");

  const distances = points.slice(1).map((p, i) => Math.hypot(...p.position.map((v, k) => v - points[i].position[k])));
  const travelled = distances.reduce((a, b) => a + b, 0);
  const rotationChannel = spin ? (`ROT_${spin.axis}` as const) : undefined;
  const start = rotationChannel ? Number(timeline.default_values?.[rotationChannel] ?? 0) : 0;
  const span = points[points.length - 1].frame - points[0].frame;

  let turned = 0;
  const written = points.map((point, i) => {
    if (i > 0 && spin) {
      turned += spin.degreesPerUnit !== undefined
        ? distances[i - 1] * spin.degreesPerUnit
        : spin.totalDegrees! * (travelled > 0 ? distances[i - 1] / travelled : (point.frame - points[i - 1].frame) / span);
    }
    const [x, y, z] = point.position;
    const values: Record<string, number | string> = { POS_X: x, POS_Y: y, POS_Z: z };
    if (rotationChannel) values[rotationChannel] = Math.round((start + turned) * 1e5) / 1e5;
    const transition = i === points.length - 1 ? point.transition : (point.transition ?? args.transition ?? "linear"); // the last key starts no move
    if (transition !== undefined) values.TRANSITION = transition;
    addKeyframe(project, { timelineId: timeline.id, frame: point.frame, values });
    return { frame: point.frame, ...values };
  });
  return { timeline_id: timeline.id, keys: written, distance: Math.round(travelled * 1e3) / 1e3 };
}
