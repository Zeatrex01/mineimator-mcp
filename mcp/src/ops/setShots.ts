// set_shots: switch the rendering camera at given frames inside ONE export.
//
// How Mine-imator picks the camera (from the source at eda12dd):
//   app_update_animate.gml 136-146 runs for every exported frame and takes the FIRST camera (in timeline order) that is
//   `selected` or (`value_inherit[VISIBLE]` and not `hide`); export_update.gml 60-63 renders through that camera.
//   VISIBLE is animated and never interpolated: tl_value_interpolate.gml returns the value of the current key
//   (case e_value.VISIBLE: return val1), and tl_update_values.gml finds the current key from the frame, so a
//   VISIBLE key on a camera is a cut. The first visible camera wins, so the cameras of a shot list must never be visible
//   together. That is what this op writes. Not yet checked on screen.
//
// What it writes, for every camera named in the list: hide=false; an explicit VISIBLE on every key (a key that omits a channel
// resets it to the timeline default, which is "visible"); plus a key at frame 0 and at every frame where the camera becomes
// active or inactive. A camera that is not in the list is hidden. A key that has to be added copies the camera's nearest key
// (a hold: nothing moves) or, for a camera with no keys, nothing (its pose lives in default_values). Between two keys that
// differ, a new key would change the move, so that is refused (CUT_INSIDE_MOVE).
import { MineimatorError, warning, type Warning } from "../core/errors.ts";
import { CURVE_CHANNELS } from "../core/format.ts";
import { findTimeline, requireTimeline, type Project, type Timeline, type Values } from "../core/project.ts";

export interface Shot {
  frame: number;
  cameraId: string;
}

const bad = (reason: string) => new MineimatorError("SHOT_LIST_INVALID", { reason });

function sameLook(a: Values, b: Values): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (CURVE_CHANNELS.has(k) || k === "VISIBLE") continue;
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export function setShots(project: Project, shots: readonly Shot[]) {
  if (shots.length === 0) throw bad("it is empty");
  shots.forEach((s, i) => {
    if (!Number.isInteger(s.frame) || s.frame < 0) throw bad(`shot ${i + 1} has no whole frame number`);
    if (i > 0 && s.frame <= shots[i - 1].frame) throw bad(`shot ${i + 1} must start after shot ${i}`);
  });
  if (shots[0].frame !== 0) throw bad("the first shot must start at frame 0, or the frames before it have no camera");

  const cameras = new Map<string, Timeline>();
  for (const s of shots) {
    const camera = requireTimeline(project, s.cameraId);
    if (camera.type !== "camera") throw new MineimatorError("NOT_CAMERA", { id: camera.id, type: camera.type });
    for (let up = camera.parent && camera.parent !== "root" ? findTimeline(project, camera.parent) : undefined; up; ) {
      if (up.hide === true) throw new MineimatorError("HIDDEN_PARENT", { id: camera.id, parent: up.id });
      up = up.parent && up.parent !== "root" ? findTimeline(project, up.parent) : undefined;
    }
    cameras.set(camera.id, camera);
  }

  const activeAt = (frame: number): string => [...shots].reverse().find((s) => s.frame <= frame)!.cameraId;
  const warnings: Warning[] = [];

  for (const camera of project.timelines.filter((t) => t.type === "camera" && !cameras.has(t.id))) camera.hide = true;

  const written: Record<string, number[]> = {};
  for (const camera of cameras.values()) {
    camera.hide = false;
    camera.keyframes ??= {};
    const original = Object.entries(camera.keyframes).map(([f, v]) => ({ frame: Number(f), values: v })).sort((a, b) => a.frame - b.frame);

    const frames = new Set<number>([0, ...original.map((k) => k.frame)]);
    shots.forEach((shot, i) => {
      if (i > 0 && (shots[i - 1].cameraId === camera.id) !== (shot.cameraId === camera.id)) frames.add(shot.frame);
    });

    for (const frame of [...frames].sort((a, b) => a - b)) {
      let key = camera.keyframes[String(frame)];
      if (!key) {
        const before = [...original].reverse().find((k) => k.frame < frame);
        const after = original.find((k) => k.frame > frame);
        let base: Values = {};
        if (before && after) {
          if (!sameLook(before.values, after.values)) {
            throw new MineimatorError("CUT_INSIDE_MOVE", { camera: camera.id, frame, from: before.frame, to: after.frame });
          }
          base = before.values;
          warnings.push(warning("CUT_HOLD_KEY", { camera: camera.id, frame, from: before.frame }));
        } else if (before || after) {
          const near = (before ?? after)!;
          base = near.values;
          warnings.push(warning("CUT_HOLD_KEY", { camera: camera.id, frame, from: near.frame }));
        }
        key = {};
        for (const [channel, value] of Object.entries(base)) if (!CURVE_CHANNELS.has(channel)) key[channel] = value;
        camera.keyframes[String(frame)] = key;
      }
      key.VISIBLE = activeAt(frame) === camera.id;
    }
    written[camera.id] = Object.keys(camera.keyframes).map(Number).sort((a, b) => a - b);
  }

  project.project.view_main_camera = -5; // look through the active camera
  project.project.view_second_camera = -5;
  return {
    shots: shots.map((s) => ({ frame: s.frame, camera_id: s.cameraId })),
    cameras: written,
    hidden_cameras: project.timelines.filter((t) => t.type === "camera" && !cameras.has(t.id)).map((t) => t.id),
    warnings,
  };
}
