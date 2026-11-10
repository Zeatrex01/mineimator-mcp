// Editing sessions. A session holds one project in memory; a mutation runs on a copy and only replaces the
// session's project when the result still validates, so a failed edit changes nothing.
import { dirname, resolve } from "node:path";
import { MineimatorError } from "../core/errors.ts";
import { readProjectFile } from "../core/io.ts";
import { type Project } from "../core/project.ts";
import { errorsOf, validateProject } from "../core/validate/index.ts";
import { createScene } from "../ops/newScene.ts";
import type { Cue } from "../ops/cues.ts";
import type { StagedAssets } from "../ops/setSkin.ts";

export interface Draft {
  project: Project;
  /** The donor snapshot of a new_scene session (read only), or null. */
  donor: Project | null;
  staged: StagedAssets;
  /** Sound, text and narrator cues for the video editor. Not part of the .miproject. */
  cues: Cue[];
}

export interface Session {
  id: string;
  /** Project the session was opened from; its folder is where resource files are looked up. */
  sourcePath: string;
  baseDir: string;
  mode: "edit" | "new_scene";
  revision: number;
  state: Draft;
  savedPath?: string;
}

export class SessionStore {
  private sessions = new Map<string, Session>();
  private counter = 0;

  open(path: string, mode: "edit" | "new_scene"): Session {
    const sourcePath = resolve(path);
    const loaded = readProjectFile(sourcePath);
    const session: Session = {
      id: `s${++this.counter}`,
      sourcePath,
      baseDir: dirname(sourcePath),
      mode,
      revision: 0,
      state: mode === "edit"
        ? { project: loaded, donor: null, staged: new Map(), cues: [] }
        : { project: createScene(loaded), donor: loaded, staged: new Map(), cues: [] },
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new MineimatorError("SESSION_NOT_FOUND", { session: id });
    return s;
  }

  /** Run an edit on a copy. Commits (and bumps the revision) only if the copy has no validation errors. */
  mutate<T>(id: string, edit: (draft: Draft) => T): { result: T; session: Session } {
    const session = this.get(id);
    const draft: Draft = {
      project: structuredClone(session.state.project),
      donor: session.state.donor,
      staged: new Map(session.state.staged),
      cues: session.state.cues.map((c) => ({ ...c })),
    };
    const result = edit(draft);
    const errors = errorsOf(validateProject(draft.project));
    if (errors.length > 0) {
      throw new MineimatorError("VALIDATION_FAILED", { count: errors.length, first: errors[0].message }, { pointer: errors[0].pointer, details: errors });
    }
    session.state = draft;
    session.revision++;
    return { result, session };
  }

  close(id: string): boolean {
    return this.sessions.delete(id);
  }
}
