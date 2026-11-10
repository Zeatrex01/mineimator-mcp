// Project path checks. Pure.
import { basename, win32 } from "node:path";
import { LiveError } from "./errors.ts";

/** Absolute Windows path with backslashes, ending in .miproject; throws BAD_PATH otherwise. */
export function normaliseProjectPath(path: string): string {
  const p = path.trim().replace(/\//g, "\\");
  if (!/^[a-z]:\\/i.test(p)) {
    throw new LiveError("BAD_PATH", `Give a full drive path such as C:\\folder\\scene.miproject, got "${path}".`);
  }
  if (!/\.miproject$/i.test(p)) throw new LiveError("BAD_PATH", `Not a .miproject file: "${path}".`);
  return win32.normalize(p);
}

/** The name Mine-imator shows in its title: the file name without .miproject. */
export function projectName(path: string): string {
  return basename(path.replace(/\\/g, "/")).replace(/\.miproject$/i, "");
}

/** True if the window title shows one of these names (case-insensitive). Empty names never match. */
export function titleShowsProject(title: string, names: string | Array<string | undefined>): boolean {
  const t = title.toLowerCase();
  return [names].flat().some((n) => Boolean(n) && t.includes((n as string).toLowerCase()));
}

/** Mine-imator marks unsaved changes as "name * - Mine-imator" (app_update_caption; seen live as "name *  - Mine-imator"). */
export function hasUnsavedMarker(title: string): boolean {
  return /\s\*\s+- Mine-imator$/.test(title);
}
