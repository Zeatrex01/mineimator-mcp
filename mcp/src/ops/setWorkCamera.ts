// set_work_camera: the free "Work camera" of the Mine-imator viewport, stored in the project as
// project.work_camera {focus, angle_xy, angle_z, roll, zoom}. It is not a scene camera and never appears in a render;
// it decides what the viewport shows when the project is opened, so a scene can be looked at (live screenshot) without
// anyone dragging the view. Field names are the ones real projects store; their meaning is calibrated on screen (README).
import { MineimatorError } from "../core/errors.ts";
import type { Project } from "../core/project.ts";

export interface SetWorkCameraArgs {
  focus: readonly [number, number, number];
  angleXy: number;
  angleZ: number;
  zoom: number;
  /** The frame the application opens the project at (the timeline marker). Default: leave as it is. */
  frame?: number;
}

export function setWorkCamera(project: Project, args: SetWorkCameraArgs) {
  const bad = (channel: string, reason: string) => new MineimatorError("INVALID_VALUE", { channel, reason });
  if (args.focus.length !== 3 || !args.focus.every(Number.isFinite)) throw bad("focus", "three finite numbers [X, Y, Z]");
  if (!Number.isFinite(args.angleXy)) throw bad("angle_xy", "a number of degrees");
  if (!Number.isFinite(args.angleZ)) throw bad("angle_z", "a number of degrees");
  if (!(args.zoom >= 1)) throw bad("zoom", "a distance in scene units, 1 or more");
  if (args.frame !== undefined && (!Number.isInteger(args.frame) || args.frame < 0)) throw bad("frame", "a whole number of frames, 0 or more");
  const camera = { focus: [...args.focus], angle_xy: args.angleXy, angle_z: args.angleZ, roll: 0, zoom: args.zoom };
  project.project.work_camera = camera;
  if (args.frame !== undefined) ((project.project.timeline ??= {}) as Record<string, unknown>).marker = args.frame;
  return { work_camera: camera, ...(args.frame !== undefined ? { open_at_frame: args.frame } : {}) };
}
