// place_particles: add a particle spawner from one of the installed Mine-imator's built-in presets (Particles/*.miparticles).
// Format (from the source at eda12dd and the 14 installed presets):
//   - a preset file is {format, created_in, particles:{...}, templates:[], timelines:[], resources:[]}; the "particles"
//     object is exactly what a project stores in a template {type:"particles", particles:{...}} (project_save_particles.gml,
//     project_load_particles.gml). Its types[] are the particle kinds; each has an id, and "temp_type" "template" means a
//     sprite from the library (sprite_template names come from the library's particle list), "templateobj" means another
//     template of the preset (fountain_of_cakes, grass_explosion), listed in the preset's own "templates".
//   - the spawner timeline has type "particles" and the values SPAWN (default true), FREEZE, CLEAR (tl_value_default.gml).
//   - a constant spawner (spawn_constant true) emits spawn_amount x spawn_rate particles PER MINUTE while SPAWN is true
//     (particle_spawner_update.gml; minute_steps = 3600, background_time = marker / tempo * 60), so a window of keys
//     with SPAWN true then false is a stream. A burst spawner (spawn_constant false) emits spawn_amount x spawn_rate
//     particles once each time its active key changes while SPAWN is true (tl_update_values.gml, "Fire particles").
import { MineimatorError } from "../core/errors.ts";
import type { LibraryData, ParticlePresetBody } from "../core/library.ts";
import { newId } from "../core/ids.ts";
import { allIds, type Project, type Template, type Values } from "../core/project.ts";
import { attachTo, newTimeline } from "../core/timelineDefaults.ts";

export interface PlaceParticlesArgs {
  presetName: string;
  name?: string;
  position?: readonly [number, number, number];
  parent?: string;
  /** Frame at which spawning starts (default 0). */
  startFrame?: number;
  /** Constant spawners: the frame at which spawning stops. Ignored by bursts, which fire once at startFrame. */
  endFrame?: number;
  /** Replace spawn_amount: particles per minute for a constant spawner, particles per burst for a burst. */
  amount?: number;
  /** Replace the sprite of every library-sprite particle type (a name from list_library kind particles). */
  sprite?: string;
  /** "#RRGGBB" tint (RGB_MUL of the spawner). */
  color?: string;
}

const invalid = (channel: string, reason: string) => new MineimatorError("INVALID_VALUE", { channel, reason });

function existingTypeIds(project: Project): string[] {
  return project.templates.flatMap((t) => {
    const types = (t.particles as { types?: Array<{ id?: string }> } | undefined)?.types;
    return Array.isArray(types) ? types.map((x) => String(x.id)) : [];
  });
}

export function placeParticles(project: Project, library: LibraryData | null, preset: ParticlePresetBody, args: PlaceParticlesArgs) {
  if (!library) throw new MineimatorError("LIBRARY_NOT_CONFIGURED");
  const start = args.startFrame ?? 0;
  for (const [channel, v] of [["start_frame", args.startFrame], ["end_frame", args.endFrame]] as const) {
    if (v !== undefined && (!Number.isInteger(v) || v < 0)) throw invalid(channel, "a whole number of frames, 0 or more");
  }
  if (args.endFrame !== undefined && args.endFrame <= start) throw invalid("end_frame", "must come after start_frame");
  if (args.position !== undefined && (args.position.length !== 3 || !args.position.every(Number.isFinite))) throw invalid("position", "three finite numbers [X, Y, Z]");
  if (args.amount !== undefined && !(Number.isFinite(args.amount) && args.amount > 0)) throw invalid("amount", "a positive number");
  if (args.color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(args.color)) throw invalid("color", "looks like #RRGGBB");
  if (args.sprite !== undefined && !library.particleSprites.includes(args.sprite)) {
    throw new MineimatorError("LIBRARY_ENTRY_NOT_FOUND", { kind: "particle sprite", name: args.sprite, near: library.particleSprites.join(", ") });
  }
  if ((preset.timelines?.length ?? 0) > 0 || (preset.resources?.length ?? 0) > 0) {
    throw new MineimatorError("PRESET_UNSUPPORTED", { name: args.presetName, reason: "it carries its own timelines or resource files, which this tool does not copy" });
  }

  const particles = structuredClone(preset.particles) as Record<string, any>;
  const types = particles.types as Array<Record<string, any>> | undefined;
  if (!Array.isArray(types) || types.length === 0) throw new MineimatorError("PRESET_UNSUPPORTED", { name: args.presetName, reason: "it has no particle types" });

  // fresh ids: a preset's own ids are shared by every copy of it
  const taken = allIds(project);
  for (const id of existingTypeIds(project)) taken.add(id);

  const embedded = new Map<string, string>();
  const newTemplates: Template[] = [];
  for (const template of preset.templates ?? []) {
    const copy = structuredClone(template) as Template;
    const fresh = newId(taken);
    embedded.set(String(copy.id), fresh);
    copy.id = fresh;
    newTemplates.push(copy);
  }

  for (const type of types) {
    type.id = newId(taken);
    if (type.temp_type === "templateobj") {
      const mapped = embedded.get(String(type.temp));
      if (!mapped) throw new MineimatorError("PRESET_UNSUPPORTED", { name: args.presetName, reason: `particle type "${type.name}" uses a template the preset does not contain` });
      type.temp = mapped;
    } else if (type.temp_type === "template" && args.sprite !== undefined) {
      type.sprite_template = args.sprite;
    }
  }
  if (args.amount !== undefined) particles.spawn_amount = args.amount;

  const template: Template = { id: newId(taken), type: "particles", name: args.name ?? args.presetName, particles };
  project.templates.push(...newTemplates, template);

  const timeline = newTimeline(project, "particles", { name: args.name ?? args.presetName, temp: template.id });
  const [x, y, z] = args.position ?? [0, 0, 0];
  const resting: Values = { POS_X: x, POS_Y: y, POS_Z: z };
  if (args.color !== undefined) resting.RGB_MUL = args.color.toUpperCase();
  timeline.default_values = resting;

  const constant = particles.spawn_constant !== false;
  const keys: Record<string, Values> = {};
  if (start > 0) keys["0"] = { SPAWN: false };
  keys[String(start)] = { SPAWN: true };
  if (constant) {
    if (args.endFrame !== undefined) keys[String(args.endFrame)] = { SPAWN: false };
  } else {
    keys[String(start + 1)] = { SPAWN: false }; // the burst fired when the key at `start` became active
  }
  timeline.keyframes = keys;

  project.timelines.push(timeline);
  attachTo(project, timeline, args.parent);

  return {
    root_id: timeline.id,
    template_id: template.id,
    preset: args.presetName,
    mode: constant ? "constant" : "burst",
    particle_types: types.map((t) => String(t.name)),
    spawn_amount: particles.spawn_amount,
    keys: Object.keys(keys).map(Number),
  };
}
