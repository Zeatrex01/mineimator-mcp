// Cues: sound effects, on-screen text and narrator lines the video editor adds after the render. Mine-imator stores none of
// this, so cues live in the editing session and are written to a separate cues.json next to the project.
import { MineimatorError } from "../core/errors.ts";

export const CUE_KINDS = ["sfx", "text", "narrator"] as const;
export type CueKind = (typeof CUE_KINDS)[number];

export interface Cue {
  frame: number;
  label: string;
  kind: CueKind;
}

export interface AddCueArgs {
  frame?: number;
  /** Alternative to frame: rounded to the nearest frame at the project's tempo. */
  seconds?: number;
  label: string;
  kind: CueKind;
}

const bad = (reason: string) => new MineimatorError("CUE_INVALID", { reason });

export function addCue(cues: Cue[], tempo: number, args: AddCueArgs): Cue {
  if ((args.frame === undefined) === (args.seconds === undefined)) throw bad("give exactly one of frame or seconds");
  const frame = args.frame ?? Math.round((args.seconds as number) * tempo);
  if (!Number.isInteger(frame) || frame < 0) throw bad("the time must be a whole frame, 0 or more");
  if (args.label.trim() === "") throw bad("the label is empty");
  if (!CUE_KINDS.includes(args.kind)) throw bad(`kind must be one of ${CUE_KINDS.join(", ")}`);
  const cue: Cue = { frame, label: args.label, kind: args.kind };
  cues.push(cue);
  return cue;
}

/** The content of cues.json: cues sorted by time (insertion order within the same frame). */
export function cuesDocument(cues: readonly Cue[], project: Record<string, unknown>) {
  const tempo = typeof project.tempo === "number" && project.tempo > 0 ? project.tempo : 30;
  const sorted = cues.map((c, i) => ({ c, i })).sort((a, b) => a.c.frame - b.c.frame || a.i - b.i).map((x) => x.c);
  return {
    version: 1,
    project: typeof project.name === "string" ? project.name : "",
    tempo,
    cues: sorted.map((c) => ({ frame: c.frame, seconds: Math.round((c.frame / tempo) * 1000) / 1000, label: c.label, kind: c.kind })),
  };
}
