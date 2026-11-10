// Pose libraries are JSON data (data/poses/*.json) described by a schema generated from the zod definition below
// (npm run schema writes data/poses/pose-library.schema.json). Core defines and loads them; ops only consume them.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { MineimatorError } from "./errors.ts";
import { TRANSITIONS, humanBendAxes } from "./format.ts";

const CHANNEL = z.enum(["ROT_X", "ROT_Y", "ROT_Z", "BEND_ANGLE_X", "BEND_ANGLE_Y", "BEND_ANGLE_Z"]);
const channelValues = z.partialRecord(CHANNEL, z.number());
const name = z.string().regex(/^[a-z][a-z0-9_]*$/);

const pose = z.object({
  description: z.string().optional(),
  source_frame: z.number().int().nonnegative().optional().describe("Frame of the measured project this pose was read from."),
  transition: z.string().refine((t) => TRANSITIONS.has(t), "must be a Mine-imator transition name")
    .describe("Outgoing transition written on the pose's keyframes."),
  parts: z.record(name, channelValues).describe("Channel values per part; every owned channel left out gets missing_owned_value."),
  provenance: z.record(z.string(), z.string()).optional(),
}).strict();

export const poseLibrarySchema = z.object({
  version: z.literal(1),
  rig: z.string().regex(/^[a-z0-9_]+\/[a-z0-9_]+\/[a-z0-9_]+@\d+$/).describe('Rig id such as "human/wide/steve@1".'),
  units: z.literal("degrees"),
  space: z.literal("local"),
  owned_channels: z.array(CHANNEL).min(1).describe("Channels a pose sets completely on each part (unsupported bends are skipped)."),
  base: z.record(name, channelValues).describe("The parts of the rig and their resting values."),
  missing_owned_value: z.number(),
  poses: z.record(name, pose),
  provenance: z.record(z.string(), z.string()),
}).strict().superRefine((lib, ctx) => {
  for (const [poseName, p] of Object.entries(lib.poses)) {
    for (const [part, values] of Object.entries(p.parts)) {
      if (!(part in lib.base)) ctx.addIssue({ code: "custom", message: `pose ${poseName}: part ${part} is not in base`, path: ["poses", poseName, "parts", part] });
      for (const channel of Object.keys(values)) {
        if (!lib.owned_channels.includes(channel as z.infer<typeof CHANNEL>)) {
          ctx.addIssue({ code: "custom", message: `pose ${poseName}: ${channel} is not an owned channel`, path: ["poses", poseName, "parts", part, channel] });
        }
        const bend = /^BEND_ANGLE_([XYZ])$/.exec(channel);
        if (bend && lib.rig.startsWith("human/") && !humanBendAxes(part).includes(bend[1] as "X" | "Y" | "Z")) {
          ctx.addIssue({ code: "custom", message: `pose ${poseName}: ${part} cannot bend on ${bend[1]}`, path: ["poses", poseName, "parts", part, channel] });
        }
      }
    }
  }
});

export type PoseLibrary = z.infer<typeof poseLibrarySchema>;

export function parsePoseLibrary(text: string, origin: string): PoseLibrary {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new MineimatorError("INVALID_JSON", { reason: `${origin}: ${(e as Error).message}` });
  }
  const result = poseLibrarySchema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new MineimatorError("INVALID_VALUE", { channel: origin, reason: `${first.path.join(".")}: ${first.message}` });
  }
  return result.data;
}

/** Load every *.json file of a folder except schema files. */
export function loadPoseLibraries(dir: string): PoseLibrary[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".schema.json")).sort();
  } catch (e) {
    throw new MineimatorError("IO_ERROR", { reason: (e as Error).message });
  }
  return files.map((f) => parsePoseLibrary(readFileSync(join(dir, f), "utf8"), f));
}

/**
 * The shipped libraries of `dir`, plus the private ones of `localDir` when that folder exists (data/local, gitignored: poses
 * someone measured from their own projects). A private library of the same rig adds its poses to the shipped library and wins
 * on a name clash; its `base` is ignored. A rig only the private folder knows is added as it is.
 */
export function loadPoseLibrariesWithLocal(dir: string, localDir?: string): PoseLibrary[] {
  const shipped = loadPoseLibraries(dir);
  if (!localDir || !existsSync(localDir)) return shipped;
  const merged = [...shipped];
  for (const local of loadPoseLibraries(localDir)) {
    const index = merged.findIndex((l) => l.rig === local.rig);
    if (index < 0) merged.push(local);
    else merged[index] = { ...merged[index], poses: { ...merged[index].poses, ...local.poses } };
  }
  return merged;
}

export function poseLibraryJsonSchema(): unknown {
  return z.toJSONSchema(poseLibrarySchema, { io: "input" });
}
