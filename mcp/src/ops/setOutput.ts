// set_output: picture size, timeline speed and the exported range. Mine-imator stores no scene length;
// the length is the export region, so it is written as region_start 0 .. region_end seconds*tempo.
import { MineimatorError } from "../core/errors.ts";
import type { Project } from "../core/project.ts";

export interface SetOutputArgs {
  width: number;
  height: number;
  tempo: number;
  lengthSeconds: number;
}

export function setOutput(project: Project, args: SetOutputArgs) {
  const frames = args.lengthSeconds * args.tempo;
  if (Math.abs(frames - Math.round(frames)) > 1e-9) {
    throw new MineimatorError("NONINTEGRAL_DURATION", { seconds: args.lengthSeconds, tempo: args.tempo, frames });
  }
  for (const [channel, v] of [["width", args.width], ["height", args.height]] as const) {
    if (!Number.isInteger(v) || v < 1) throw new MineimatorError("INVALID_VALUE", { channel, reason: "a positive whole number of pixels" });
  }
  if (!Number.isFinite(args.tempo) || args.tempo <= 0) throw new MineimatorError("INVALID_VALUE", { channel: "tempo", reason: "a positive number" });
  const end = Math.round(frames);
  if (end < 1) throw new MineimatorError("INVALID_VALUE", { channel: "length_seconds", reason: "at least one frame" });

  const p = project.project;
  p.video_width = args.width;
  p.video_height = args.height;
  p.video_keep_aspect_ratio = false;
  p.tempo = args.tempo;
  const timeline = ((p.timeline as Record<string, unknown> | undefined) ??= {});
  timeline.region_start = 0;
  timeline.region_end = end;

  // Cameras follow the project size unless a key asks otherwise; only explicit "false" values are changed.
  let cameras = 0;
  for (const camera of project.timelines.filter((t) => t.type === "camera")) {
    cameras++;
    if (camera.default_values?.CAM_SIZE_USE_PROJECT === false) camera.default_values.CAM_SIZE_USE_PROJECT = true;
    for (const key of Object.values(camera.keyframes ?? {})) {
      if (key.CAM_SIZE_USE_PROJECT === false) key.CAM_SIZE_USE_PROJECT = true;
    }
  }
  return { width: args.width, height: args.height, tempo: args.tempo, region_start: 0, region_end: end, cameras_updated: cameras };
}
