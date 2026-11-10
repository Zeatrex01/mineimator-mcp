// The built-in library of an installed Mine-imator, read only: characters and mobs, special blocks, blocks, items,
// particle sprites and particle presets. Nothing here writes or launches anything.
//
// Where the data lives (from the installed 2.0.2 files and the source at eda12dd):
//   <home>/Data/Minecraft/<version>.midata   JSON list of models, blocks, item and particle textures
//                                            (loader: minecraft_assets_load.gml, model_load.gml, block_load)
//   <home>/Data/Minecraft/<version>.zip      assets/minecraft/models/character|special_block/*.mimodel part trees
//   <home>/Particles/*.miparticles           particle presets (loader: particles_load.gml)
// <version> is the one named in <home>/Data/settings.midata (assets.version), else the highest .midata file.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MineimatorError } from "./errors.ts";
import { openZip, type ZipIndex } from "./zip.ts";

export type StatePairs = Array<[string, string]>;

export interface ModelStateValue {
  value: string;
  file?: string;
  hide: string[];
}

export interface LibraryModel {
  name: string;
  kind: "character" | "special_block";
  version: number;
  file?: string;
  states: Record<string, ModelStateValue[]>;
  defaultState: StatePairs;
}

export interface LibraryBlock {
  name: string;
  states: Record<string, string[]>;
  defaultState: StatePairs;
}

export interface LibraryData {
  home: string;
  version: string;
  characters: Map<string, LibraryModel>;
  specialBlocks: Map<string, LibraryModel>;
  blocks: Map<string, LibraryBlock>;
  /** Item texture names; the index is the item slot. Some slots are empty strings (unused). */
  items: string[];
  particleSprites: string[];
  presetNames: string[];
}

export interface ModelPart {
  name: string;
  depth: number;
  lockBend: boolean;
  backfaces: boolean;
  parts: ModelPart[];
}

export interface ResolvedModel {
  name: string;
  kind: "character" | "special_block";
  version: number;
  /** The state written to the template, in Mine-imator's order. */
  state: StatePairs;
  /** The part tree of the chosen model file. */
  parts: ModelPart[];
  /** Part names hidden by the chosen state values. */
  hidden: string[];
  file: string;
}

export interface ParticlePresetBody {
  particles: Record<string, unknown>;
  templates?: Array<Record<string, unknown>>;
  timelines?: unknown[];
  resources?: unknown[];
  [key: string]: unknown;
}

const unreadable = (reason: string) => new MineimatorError("LIBRARY_UNREADABLE", { reason });

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw unreadable(`${path}: ${(e as Error).message}`);
  }
}

function parseStatePairs(text: unknown): StatePairs {
  if (typeof text !== "string" || text === "") return [];
  return text.split(",").map((pair) => {
    const at = pair.indexOf("=");
    return [pair.slice(0, at), pair.slice(at + 1)] as [string, string];
  });
}

const valueOf = (v: unknown): string => String(typeof v === "object" && v !== null ? (v as { value?: unknown }).value : v);

function parseModel(entry: any, kind: LibraryModel["kind"]): LibraryModel {
  const states: Record<string, ModelStateValue[]> = {};
  for (const [key, list] of Object.entries<any>(entry.states ?? {})) {
    states[key] = (list as unknown[]).map((v: any) => ({
      value: valueOf(v),
      ...(typeof v === "object" && typeof v.file === "string" ? { file: v.file } : {}),
      hide: typeof v === "object" && Array.isArray(v.hide) ? v.hide.map(String) : [],
    }));
  }
  return {
    name: String(entry.name),
    kind,
    version: typeof entry.version === "number" ? entry.version : 0,
    ...(typeof entry.file === "string" ? { file: entry.file } : {}),
    states,
    defaultState: parseStatePairs(entry.default_state),
  };
}

/** The asset version Mine-imator loads: settings.midata names it, otherwise the highest .midata file. */
function pickVersion(dataDir: string): string {
  const dir = join(dataDir, "Minecraft");
  if (!existsSync(dir)) throw unreadable(`${dir} does not exist`);
  const available = readdirSync(dir).filter((f) => f.endsWith(".midata")).map((f) => f.slice(0, -".midata".length));
  if (available.length === 0) throw unreadable(`${dir} has no .midata file`);
  try {
    const wanted = readJson(join(dataDir, "settings.midata"))?.assets?.version;
    if (typeof wanted === "string" && available.includes(wanted)) return wanted;
  } catch {
    /* fall back to the highest version */
  }
  return available.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)!;
}

export function loadLibrary(home: string): LibraryData {
  const dataDir = join(home, "Data");
  if (!existsSync(dataDir)) throw unreadable(`${home} has no Data folder; is MINEIMATOR_HOME the Mine-imator folder?`);
  const version = pickVersion(dataDir);
  const midata = readJson(join(dataDir, "Minecraft", `${version}.midata`));

  const blocks = new Map<string, LibraryBlock>();
  for (const b of midata.blocks ?? []) {
    const states: Record<string, string[]> = {};
    for (const [key, list] of Object.entries<any>(b.states ?? {})) states[key] = (list as unknown[]).map(valueOf);
    blocks.set(String(b.name), { name: String(b.name), states, defaultState: parseStatePairs(b.default_state) });
  }

  const presetsDir = join(home, "Particles");
  const presetNames = existsSync(presetsDir)
    ? readdirSync(presetsDir).filter((f) => f.endsWith(".miparticles")).map((f) => f.slice(0, -".miparticles".length)).sort((a, b) => a.localeCompare(b))
    : [];

  return {
    home,
    version,
    characters: new Map<string, LibraryModel>((midata.characters ?? []).map((m: any) => [String(m.name), parseModel(m, "character")])),
    specialBlocks: new Map<string, LibraryModel>((midata.special_blocks ?? []).map((m: any) => [String(m.name), parseModel(m, "special_block")])),
    blocks,
    items: (midata.item_textures ?? []).map(String),
    particleSprites: (midata.particles ?? []).map((p: any) => String(p.name)),
    presetNames,
  };
}

// ---- model files -------------------------------------------------------------------------------------------

const zips = new Map<string, ZipIndex>();
function zipOf(library: LibraryData): ZipIndex {
  const path = join(library.home, "Data", "Minecraft", `${library.version}.zip`);
  let zip = zips.get(path);
  if (!zip) {
    try {
      zip = openZip(path);
    } catch (e) {
      throw unreadable((e as Error).message);
    }
    zips.set(path, zip);
  }
  return zip;
}

/** Part tree of a .mimodel (model_file_load_part.gml: depth, backfaces, lock_bend; children are listed under "parts"). */
function parseParts(list: any[] | undefined, parentHasBend: boolean): ModelPart[] {
  return (list ?? []).map((p) => ({
    name: String(p.name),
    depth: typeof p.depth === "number" ? p.depth : 0,
    // lock_bend is true unless the parent bends and the part says otherwise (model_file_load_part.gml 163-168)
    lockBend: parentHasBend && typeof p.lock_bend === "boolean" ? p.lock_bend : true,
    backfaces: p.backfaces === true,
    parts: parseParts(p.parts, p.bend !== undefined),
  }));
}

function directoryOf(kind: LibraryModel["kind"]): string {
  return kind === "character" ? "assets/minecraft/models/character/" : "assets/minecraft/models/special_block/";
}

export function findModel(library: LibraryData, name: string): LibraryModel | undefined {
  // Mine-imator keeps characters and special blocks in one name map, later entries replacing earlier ones.
  return library.specialBlocks.get(name) ?? library.characters.get(name);
}

export function closest(names: Iterable<string>, wanted: string, limit = 6): string[] {
  const w = wanted.toLowerCase();
  return [...names].filter((n) => n.toLowerCase().includes(w) || w.includes(n.toLowerCase())).slice(0, limit);
}

/** Choose the model file and hidden parts for a state, as temp_update_model.gml does, and read the part tree. */
export function resolveModel(library: LibraryData, name: string, overrides: Record<string, string> = {}): ResolvedModel {
  const model = findModel(library, name);
  if (!model) {
    const all = [...library.characters.keys(), ...library.specialBlocks.keys()];
    throw new MineimatorError("LIBRARY_ENTRY_NOT_FOUND", { kind: "character or special block", name, near: closest(all, name).join(", ") || "call list_library" });
  }
  const state = new Map<string, string>(model.defaultState);
  for (const [key, value] of Object.entries(overrides)) {
    const allowed = model.states[key]?.map((v) => v.value);
    if (!allowed) throw new MineimatorError("LIBRARY_STATE_INVALID", { name, state: key, reason: `unknown state; known: ${Object.keys(model.states).join(", ") || "none"}` });
    if (!allowed.includes(value)) throw new MineimatorError("LIBRARY_STATE_INVALID", { name, state: key, reason: `"${value}" is not one of: ${allowed.join(", ")}` });
    state.set(key, value);
  }

  let file = model.file;
  const hidden = new Set<string>();
  for (const [key, values] of Object.entries(model.states)) {
    const chosen = state.get(key);
    const match = chosen === undefined ? undefined : values.find((v) => v.value === chosen);
    if (!match) continue;
    if (match.file) file = match.file;
    for (const h of match.hide) hidden.add(h);
  }
  if (!file) throw unreadable(`model "${name}" names no model file for the state ${JSON.stringify([...state])}`);

  const path = directoryOf(model.kind) + file;
  const zip = zipOf(library);
  if (!zip.has(path)) throw unreadable(`${library.version}.zip has no ${path}`);
  let parsed: any;
  try {
    parsed = JSON.parse(zip.read(path).toString("utf8"));
  } catch (e) {
    throw unreadable(`${path}: ${(e as Error).message}`);
  }
  return {
    name: model.name,
    kind: model.kind,
    version: model.version,
    state: [...state],
    parts: parseParts(parsed.parts, false),
    hidden: [...hidden],
    file,
  };
}

// ---- particle presets -------------------------------------------------------------------------------------

export function loadPreset(library: LibraryData, name: string): ParticlePresetBody {
  if (!library.presetNames.includes(name)) {
    throw new MineimatorError("LIBRARY_ENTRY_NOT_FOUND", { kind: "particle preset", name, near: library.presetNames.join(", ") });
  }
  const body = readJson(join(library.home, "Particles", `${name}.miparticles`));
  if (!body || typeof body !== "object" || typeof body.particles !== "object" || body.particles === null) {
    throw unreadable(`Particles/${name}.miparticles has no "particles" section`);
  }
  return body as ParticlePresetBody;
}
