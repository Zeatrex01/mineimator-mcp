// Reads the name stored inside a .miproject (project.name). Mine-imator shows THIS in its window title, not the file name:
// live run 2026-11-10: file milestone-1.miproject, title "My Scene - Mine-imator".
import { readFileSync, statSync } from "node:fs";

const MAX_BYTES = 64 * 1024 * 1024;

export function readProjectName(path: string): string | undefined {
  try {
    if (statSync(path).size > MAX_BYTES) return undefined;
    const data = JSON.parse(readFileSync(path, "utf8")) as { project?: { name?: unknown } };
    const name = data.project?.name;
    return typeof name === "string" && name.length > 0 ? name : undefined;
  } catch {
    return undefined;
  }
}
