// Export-camera sanity. Mine-imator renders each frame through the FIRST camera that is not hidden and is visible at that
// frame (app_update_animate.gml 136-146), and VISIBLE keys are never interpolated. A scene with one camera is simple; a
// scene with several is a cut list only if exactly one of them is visible at every frame. Both problems are warnings
// (real projects include scenes with no camera and with several).
import type { Project, Timeline } from "../project.ts";
import type { Report } from "./report.ts";

/** Whether a camera is visible at `frame`: its latest key at or before the frame, else the timeline default (true). */
function visibleAt(camera: Timeline, frame: number): boolean {
  const keys = Object.keys(camera.keyframes ?? {}).map(Number).filter((f) => f <= frame).sort((a, b) => b - a);
  const key = keys.length > 0 ? camera.keyframes![String(keys[0])] : undefined;
  const value = key && "VISIBLE" in key ? key.VISIBLE : camera.default_values?.VISIBLE;
  return value !== false;
}

export function checkCameras(project: Project, r: Report): void {
  const cameras = project.timelines.filter((t) => t.type === "camera");
  const usable = cameras.filter((c) => c.hide !== true);
  if (cameras.length === 0) {
    r.warn("NO_CAMERA", "/timelines", "the project has no camera, so there is nothing to export through");
    return;
  }
  if (usable.length === 0) {
    r.warn("NO_CAMERA", "/timelines", "every camera is hidden");
    return;
  }
  if (usable.length === 1 && !Object.values(usable[0].keyframes ?? {}).some((k) => k.VISIBLE === false) && usable[0].default_values?.VISIBLE !== false) return;

  // several cameras (or a camera that switches itself off): check every frame where something changes
  const frames = new Set<number>([0]);
  for (const c of usable) for (const f of Object.keys(c.keyframes ?? {})) frames.add(Number(f));
  const gaps: number[] = [];
  const overlaps: number[] = [];
  for (const frame of [...frames].sort((a, b) => a - b)) {
    const visible = usable.filter((c) => visibleAt(c, frame)).length;
    if (visible === 0) gaps.push(frame);
    else if (visible > 1) overlaps.push(frame);
  }
  if (overlaps.length > 0) {
    r.warn("MULTIPLE_CAMERAS", "/timelines", `more than one camera is visible from frame ${overlaps[0]}; the export uses the first one in timeline order (set_shots makes a clean cut list)`);
  }
  if (gaps.length > 0) {
    r.warn("CAMERA_GAP", "/timelines", `no camera is visible from frame ${gaps[0]}; the export has nothing to render through there`);
  }
}
