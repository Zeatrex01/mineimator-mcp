// File access for project files. Writing is exclusive: an existing file is never replaced.
import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { MineimatorError } from "./errors.ts";
import { parseProject, type Project } from "./project.ts";

function ioError(e: unknown): MineimatorError {
  return new MineimatorError("IO_ERROR", { reason: (e as Error).message });
}

export function readProjectFile(path: string): Project {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw ioError(e);
  }
  return parseProject(text, path);
}

export function sha256OfFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Nearest ancestor of `path` that exists, resolved through symbolic links. */
function realExistingAncestor(path: string): string {
  let current = resolve(path);
  while (!existsSync(current)) current = dirname(current);
  return realpathSync(current);
}

/**
 * Refuse destinations outside `outputRoot` (when one is configured), including escapes through symbolic links.
 * Returns the absolute target path.
 */
export function checkDestination(target: string, outputRoot: string | undefined, extension = ".miproject"): string {
  const absolute = resolve(target);
  if (!absolute.toLowerCase().endsWith(extension)) {
    throw new MineimatorError("DEST_NOT_ALLOWED", { reason: `The target file name must end with ${extension}.` });
  }
  if (outputRoot) {
    const root = existsSync(outputRoot) ? realpathSync(outputRoot) : resolve(outputRoot);
    const real = realExistingAncestor(dirname(absolute));
    const rel = relative(root, real);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new MineimatorError("DEST_NOT_ALLOWED", { reason: `Output is only allowed under ${root}.` });
    }
  }
  return absolute;
}

/** Write a project to a file that does not exist yet. Atomic and race-free where the file system allows hard links. */
export function writeNewProjectFile(project: Project, target: string): string {
  return writeNewTextFile(JSON.stringify(project, null, "\t"), target);
}

/** Write text to a file that does not exist yet (same guarantees as writeNewProjectFile). */
export function writeNewTextFile(text: string, target: string): string {
  const absolute = resolve(target);
  if (existsSync(absolute)) throw new MineimatorError("DEST_EXISTS", { path: absolute });
  const tmp = `${absolute}.tmp-${process.pid}`;
  try {
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(tmp, text, { encoding: "utf8", flag: "wx" });
    try {
      linkSync(tmp, absolute); // fails with EEXIST if someone created the file meanwhile
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new MineimatorError("DEST_EXISTS", { path: absolute });
      if (existsSync(absolute)) throw new MineimatorError("DEST_EXISTS", { path: absolute });
      renameSync(tmp, absolute); // file system without hard links
      return absolute;
    }
    return absolute;
  } catch (e) {
    if (e instanceof MineimatorError) throw e;
    throw ioError(e);
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* temp file already gone */
    }
  }
}
