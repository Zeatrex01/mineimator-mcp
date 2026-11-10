// Resource files a project depends on. A .miproject stores project-relative filenames, so moving the JSON
// alone loses its textures: saving copies the files the project uses next to the new file.
import { copyFileSync, existsSync, mkdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { MineimatorError, warning, type Warning } from "./errors.ts";
import type { Project } from "./project.ts";

export type AssetStatus = "present" | "cache_only" | "staged" | "missing";

export interface AssetEntry {
  id: string;
  type: string;
  filename: string;
  status: AssetStatus;
  /** Absolute file to copy, when there is one. */
  source?: string;
  /** Absolute .meshcache next to the original, copied along with it when it exists. */
  cache?: string;
}

/** Files added during the session (for example a new skin), keyed by the project-relative filename they will get. */
export type PendingAssets = ReadonlyMap<string, string>;

export function buildManifest(project: Project, baseDir: string, pending: PendingAssets = new Map()): AssetEntry[] {
  const entries: AssetEntry[] = [];
  for (const r of project.resources) {
    if (typeof r.filename !== "string" || r.filename === "") continue;
    const entry: AssetEntry = { id: r.id, type: r.type, filename: r.filename, status: "missing" };
    const staged = pending.get(r.filename);
    const original = join(baseDir, r.filename);
    const cache = `${original}.meshcache`;
    if (staged) {
      Object.assign(entry, { status: "staged", source: staged });
    } else if (r.type !== "fromworld" && existsSync(original)) {
      Object.assign(entry, { status: "present", source: original });
    }
    if (existsSync(cache)) {
      entry.cache = cache;
      if (entry.status === "missing") entry.status = "cache_only";
    }
    entries.push(entry);
  }
  return entries;
}

export function manifestWarnings(project: Project, manifest: AssetEntry[]): Warning[] {
  const out: Warning[] = [];
  for (const e of manifest) {
    const pointer = `/resources/${project.resources.findIndex((r) => r.id === e.id)}`;
    if (e.status === "missing") out.push(warning("MISSING_ASSET", { filename: e.filename }, pointer));
    if (e.status === "cache_only") out.push(warning("CACHE_ONLY", { filename: e.filename }, pointer));
    const dir = project.resources.find((r) => r.id === e.id)?.world_regions_dir;
    if (typeof dir === "string" && isAbsolute(dir)) out.push(warning("ABSOLUTE_WORLD_PATH", { id: e.id, dir }, pointer));
  }
  return out;
}

function sameFile(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/** Copy one file; returns the path when a new file was created, undefined when an identical one was already there. */
function copyOne(source: string, destDir: string, filename: string, suffix = ""): string | undefined {
  const target = resolve(destDir, filename + suffix);
  const rel = relative(resolve(destDir), target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new MineimatorError("DEST_NOT_ALLOWED", { reason: `The resource name "${filename}" points outside the project folder.` });
  }
  if (existsSync(target)) {
    if (sameFile(source, target) || statSync(source).size === statSync(target).size) return undefined;
    throw new MineimatorError("DEST_EXISTS", { path: target });
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  return target;
}

/**
 * Copy every file the manifest can supply into `destDir`. Throws MISSING_ASSET for a resource nothing can supply.
 * `created` lists the files this call wrote, so a caller can remove them if the save fails later.
 */
export function copyAssets(manifest: AssetEntry[], destDir: string): { filenames: string[]; created: string[] } {
  for (const e of manifest) {
    if (e.status === "missing") throw new MineimatorError("MISSING_ASSET", { filename: e.filename });
  }
  const filenames: string[] = [];
  const created: string[] = [];
  try {
    for (const e of manifest) {
      for (const made of [e.source && copyOne(e.source, destDir, e.filename), e.cache && copyOne(e.cache, destDir, e.filename, ".meshcache")]) {
        if (made) created.push(made);
      }
      filenames.push(e.filename);
    }
  } catch (e) {
    for (const file of created) rmSync(file, { force: true });
    if (e instanceof MineimatorError) throw e;
    throw new MineimatorError("IO_ERROR", { reason: (e as Error).message });
  }
  return { filenames, created };
}
