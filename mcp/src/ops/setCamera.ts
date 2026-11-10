// set_camera: write one camera key (position, rotation, optional field of view); optionally make it the export camera.
// Camera conventions (measured from camera/character pairs in real projects):
//   ROT_Z is the clockwise heading from +Y (forward = (sin z, cos z)); positive ROT_X looks DOWN; CAM_FOV is degrees.
import { MineimatorError, warning, type Warning } from "../core/errors.ts";
import { allIds, findTimeline, nextSiblingIndex, requireTimeline, type Project, type Timeline } from "../core/project.ts";
import { newId } from "../core/ids.ts";

export interface SetCameraArgs {
  cameraId?: string;
  frame: number;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  fov?: number;
  activate?: boolean;
}

/** The structural fields of a camera as Mine-imator 2.0.2 writes them. */
function newCamera(project: Project): Timeline {
  return {
    id: newId(allIds(project)),
    type: "camera",
    name: "",
    temp: "null",
    color_tag: "null",
    hide: false,
    lock: false,
    ghost: false,
    depth: 0,
    default_values: {},
    keyframes: {},
    parent: "root",
    parent_tree_index: nextSiblingIndex(project, "root"),
    lock_bend: true,
    tree_extend: false,
    inherit: {
      position: true, rotation: true, scale: true, alpha: false, color: false, texture: false, surface: true,
      subsurface: true, visibility: true, bend: false, rot_point: false, glow_color: true, select: false, pose: false,
    },
    scale_resize: true,
  };
}

function checkVector(name: string, v: readonly number[]): void {
  if (v.length !== 3 || !v.every(Number.isFinite)) throw new MineimatorError("INVALID_VALUE", { channel: name, reason: "three finite numbers [X, Y, Z]" });
}

/** The field of view a key falls back to if it names none: the nearest key that sets one, earlier keys first. */
function nearestFov(camera: Timeline, frame: number): number | undefined {
  const keys = Object.entries(camera.keyframes ?? {})
    .filter(([f, v]) => Number(f) !== frame && typeof v.CAM_FOV === "number")
    .map(([f, v]) => ({ f: Number(f), fov: v.CAM_FOV as number }));
  const before = keys.filter((k) => k.f < frame).sort((a, b) => b.f - a.f)[0];
  const after = keys.filter((k) => k.f > frame).sort((a, b) => a.f - b.f)[0];
  const picked = before ?? after;
  if (picked) return picked.fov;
  const d = camera.default_values?.CAM_FOV;
  return typeof d === "number" ? d : undefined;
}

export function setCamera(project: Project, args: SetCameraArgs) {
  if (!Number.isInteger(args.frame) || args.frame < 0) {
    throw new MineimatorError("INVALID_VALUE", { channel: "frame", reason: "a whole number of frames, 0 or more" });
  }
  checkVector("position", args.position);
  checkVector("rotation", args.rotation);
  if (args.fov !== undefined && !(args.fov >= 1 && args.fov <= 170)) {
    throw new MineimatorError("INVALID_VALUE", { channel: "CAM_FOV", reason: "between 1 and 170 degrees" });
  }

  let camera: Timeline;
  let created = false;
  if (args.cameraId !== undefined) {
    camera = requireTimeline(project, args.cameraId);
    if (camera.type !== "camera") throw new MineimatorError("NOT_CAMERA", { id: camera.id, type: camera.type });
  } else {
    camera = newCamera(project);
    created = true;
  }

  if (args.activate) {
    for (let up = camera.parent && camera.parent !== "root" ? findTimeline(project, camera.parent) : undefined; up; ) {
      if (up.hide === true) throw new MineimatorError("HIDDEN_PARENT", { id: camera.id, parent: up.id });
      up = up.parent && up.parent !== "root" ? findTimeline(project, up.parent) : undefined;
    }
  }

  const warnings: Warning[] = [];
  camera.keyframes ??= {};
  const key = (camera.keyframes[String(args.frame)] ??= {});
  const [px, py, pz] = args.position;
  const [rx, ry, rz] = args.rotation;
  Object.assign(key, { POS_X: px, POS_Y: py, POS_Z: pz, ROT_X: rx, ROT_Y: ry, ROT_Z: rz });
  if (args.fov !== undefined) {
    key.CAM_FOV = args.fov;
  } else if (key.CAM_FOV === undefined) {
    const carried = nearestFov(camera, args.frame);
    if (carried !== undefined) {
      key.CAM_FOV = carried;
      warnings.push(warning("FOV_CARRIED", { fov: carried }, `${camera.id}/keyframes/${args.frame}`));
    }
  }

  if (args.activate) {
    camera.hide = false;
    if (camera.default_values?.VISIBLE === false) camera.default_values.VISIBLE = true;
    for (const k of Object.values(camera.keyframes)) if (k.VISIBLE === false) k.VISIBLE = true;
    for (const other of project.timelines) if (other.type === "camera" && other.id !== camera.id) other.hide = true;
    project.project.view_main_camera = camera.id;
    project.project.view_second_camera = -5;
  }

  if (created) project.timelines.push(camera);
  return { camera_id: camera.id, frame: args.frame, created, warnings };
}
