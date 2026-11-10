// list_library: what the installed Mine-imator ships, so a client can ask for "chicken", "cake" or "heart" by a real name.
import type { LibraryData, LibraryModel, ParticlePresetBody } from "../core/library.ts";
import { SHAPES, SHAPE_UNITS } from "./placeProp.ts";

export const LIBRARY_KINDS = ["characters", "special_blocks", "blocks", "items", "particles", "shapes"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export interface ListLibraryArgs {
  kind?: LibraryKind;
  search?: string;
  limit?: number;
}

const model = (m: LibraryModel) => ({
  name: m.name,
  states: Object.fromEntries(Object.entries(m.states).map(([k, v]) => [k, v.map((x) => x.value)])),
  default_state: Object.fromEntries(m.defaultState),
});

const matcher = (search: string | undefined) => {
  const s = search?.trim().toLowerCase();
  return (name: string) => !s || name.toLowerCase().includes(s);
};

function describePreset(name: string, body: ParticlePresetBody) {
  const p = body.particles as { spawn_constant?: boolean; spawn_amount?: number; types?: Array<Record<string, unknown>> };
  return {
    name,
    mode: p.spawn_constant === false ? "burst" : "constant",
    spawn_amount: p.spawn_amount ?? null,
    types: (p.types ?? []).map((t) => ({ name: t.name, temp_type: t.temp_type, sprite: t.temp_type === "template" ? t.sprite_template : null })),
    embedded_templates: (body.templates ?? []).map((t) => `${t.type}:${(t.block as { name?: string } | undefined)?.name ?? ""}`),
  };
}

/** `presets` is only read when `kind` is "particles"; the caller loads the preset files. */
export function listLibrary(library: LibraryData, args: ListLibraryArgs, presets: ReadonlyMap<string, ParticlePresetBody> = new Map()) {
  const keep = matcher(args.search);
  const limit = args.limit ?? 80;
  const cut = <T>(rows: T[]) => ({ total: rows.length, shown: Math.min(rows.length, limit), rows: rows.slice(0, limit) });

  switch (args.kind) {
    case "characters":
      return { kind: "characters", ...cut([...library.characters.values()].filter((m) => keep(m.name)).map(model)) };
    case "special_blocks":
      return { kind: "special_blocks", ...cut([...library.specialBlocks.values()].filter((m) => keep(m.name)).map(model)) };
    case "blocks":
      return {
        kind: "blocks",
        ...cut([...library.blocks.values()].filter((b) => keep(b.name)).map((b) => ({ name: b.name, states: b.states, default_state: Object.fromEntries(b.defaultState) }))),
      };
    case "items":
      return { kind: "items", ...cut(library.items.map((name, slot) => ({ name, slot })).filter((i) => i.name !== "" && keep(i.name))) };
    case "particles":
      return {
        kind: "particles",
        presets: library.presetNames.filter(keep).map((n) => (presets.has(n) ? describePreset(n, presets.get(n)!) : { name: n })),
        sprites: library.particleSprites.filter(keep),
      };
    case "shapes":
      return { kind: "shapes", shapes: [...SHAPES], units_at_scale_1: SHAPE_UNITS, note: "A shape is 16 scene units across at scale 1 and is centred on its position." };
    default:
      return {
        version: library.version,
        counts: {
          characters: library.characters.size,
          special_blocks: library.specialBlocks.size,
          blocks: library.blocks.size,
          items: library.items.length,
          particle_presets: library.presetNames.length,
          particle_sprites: library.particleSprites.length,
        },
        characters: [...library.characters.keys()].filter(keep),
        special_blocks: [...library.specialBlocks.keys()].filter(keep),
        particle_presets: library.presetNames.filter(keep),
        particle_sprites: library.particleSprites.filter(keep),
        shapes: [...SHAPES],
        hint: "Ask for one kind (characters, special_blocks, blocks, items, particles, shapes) to see states, slots and details; use search to narrow it.",
      };
  }
}
