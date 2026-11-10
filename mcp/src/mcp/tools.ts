// Tool handlers: the only place where sessions, files, configuration and pure ops meet.
// Each handler takes the arguments of its MCP tool (snake_case) and returns plain JSON, or throws MineimatorError.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { buildManifest, copyAssets, manifestWarnings } from "../core/assets.ts";
import { MineimatorError } from "../core/errors.ts";
import { checkDestination, sha256OfFile, writeNewProjectFile, writeNewTextFile } from "../core/io.ts";
import { loadLibrary, loadPreset, resolveModel, type LibraryData, type ParticlePresetBody } from "../core/library.ts";
import { renderInstructions } from "../core/messages.ts";
import { readPngSize } from "../core/png.ts";
import { loadPoseLibrariesWithLocal, type PoseLibrary } from "../core/poseLibrary.ts";
import { summarize } from "../core/project.ts";
import { errorsOf, validateProject } from "../core/validate/index.ts";
import type { Config } from "../config.ts";
import { addKeyframe } from "../ops/addKeyframe.ts";
import { animatePath } from "../ops/animatePath.ts";
import { addCue, cuesDocument, type CueKind } from "../ops/cues.ts";
import { listTemplates } from "../ops/listTemplates.ts";
import { listTimelines } from "../ops/listTimelines.ts";
import { listLibrary, type LibraryKind } from "../ops/listLibrary.ts";
import { placeBuiltInCharacter } from "../ops/placeBuiltInCharacter.ts";
import { giveItem } from "../ops/giveItem.ts";
import { placeBlocks, type BlockEntry } from "../ops/placeBlocks.ts";
import { setParent } from "../ops/setParent.ts";
import { placeCharacter } from "../ops/placeCharacter.ts";
import { placeParticles } from "../ops/placeParticles.ts";
import { placeProp } from "../ops/placeProp.ts";
import { placeSet } from "../ops/placeSet.ts";
import { setCamera } from "../ops/setCamera.ts";
import { setOutput } from "../ops/setOutput.ts";
import { setWorkCamera } from "../ops/setWorkCamera.ts";
import { setPose } from "../ops/setPose.ts";
import { setShots } from "../ops/setShots.ts";
import { setSkin } from "../ops/setSkin.ts";
import { SessionStore, type Session } from "./sessions.ts";

type V3 = [number, number, number];

/** cues.json sits next to the project: scene.miproject -> scene.cues.json. */
const cuesPathOf = (projectPath: string) => join(dirname(projectPath), basename(projectPath).replace(/\.miproject$/i, "") + ".cues.json");

export function createTools(config: Config, libraries: readonly PoseLibrary[] = loadPoseLibrariesWithLocal(config.posesDir, config.localPosesDir)) {
  const store = new SessionStore();
  let cachedLibrary: LibraryData | undefined;
  /** The built-in library of the installed Mine-imator, read once. null when MINEIMATOR_HOME is not set. */
  const library = (): LibraryData | null => (config.mineimatorHome ? (cachedLibrary ??= loadLibrary(config.mineimatorHome)) : null);
  const requireLibrary = (): LibraryData => {
    const lib = library();
    if (!lib) throw new MineimatorError("LIBRARY_NOT_CONFIGURED");
    return lib;
  };
  const ok = (session: Session) => ({ session_id: session.id, revision: session.revision });

  return {
    libraries,

    open_project(a: { path: string; mode?: "edit" | "new_scene" }) {
      const session = store.open(a.path, a.mode ?? "edit");
      const manifest = buildManifest(session.state.project, session.baseDir);
      return {
        ...ok(session),
        mode: session.mode,
        source_sha256: sha256OfFile(session.sourcePath),
        ...summarize(session.state.project),
        donor: session.state.donor ? summarize(session.state.donor) : null,
        warnings: manifestWarnings(session.state.project, manifest),
      };
    },

    list_templates(a: { session_id: string; type?: string }) {
      const s = store.get(a.session_id);
      return { ...ok(s), templates: listTemplates(s.state.project, s.state.donor, { type: a.type }) };
    },

    list_timelines(a: { session_id: string; root_id?: string; type?: string; from?: "scene" | "donor" }) {
      const s = store.get(a.session_id);
      if (a.from === "donor" && !s.state.donor) {
        throw new MineimatorError("INVALID_VALUE", { channel: "from", reason: "this session has no donor; open the project with mode new_scene" });
      }
      const doc = a.from === "donor" ? s.state.donor! : s.state.project;
      return { ...ok(s), timelines: listTimelines(doc, { rootId: a.root_id, type: a.type }) };
    },

    list_library(a: { kind?: LibraryKind; search?: string; limit?: number }) {
      const lib = requireLibrary();
      const presets = new Map<string, ParticlePresetBody>();
      if (a.kind === "particles") for (const name of lib.presetNames) presets.set(name, loadPreset(lib, name));
      return listLibrary(lib, { kind: a.kind, search: a.search, limit: a.limit }, presets);
    },

    place_character(a: { session_id: string; source_root_id?: string; library?: string; state?: Record<string, string>; name: string; position: V3; rotation_z?: number }) {
      if ((a.source_root_id === undefined) === (a.library === undefined)) {
        throw new MineimatorError("INVALID_VALUE", { channel: "source", reason: "give exactly one of source_root_id (copy from the donor) or library (a built-in model)" });
      }
      if (a.library !== undefined) {
        const model = resolveModel(requireLibrary(), a.library, a.state);
        const { result, session } = store.mutate(a.session_id, (d) => placeBuiltInCharacter(d.project, model, { name: a.name, position: a.position, rotationZ: a.rotation_z }));
        return { ...ok(session), ...result };
      }
      const { result, session } = store.mutate(a.session_id, (d) =>
        placeCharacter(d.project, d.donor, { sourceRootId: a.source_root_id!, name: a.name, position: a.position }));
      return { ...ok(session), ...result };
    },

    place_prop(a: {
      session_id: string; shape?: string; block?: string; state?: Record<string, string>; item?: string; source_root_id?: string; keep_animation?: boolean;
      name?: string; position?: V3; rotation?: V3; scale?: number | V3; size?: number; color?: string; parent?: string; anchor?: "bottom_center" | "corner";
    }) {
      const { result, session } = store.mutate(a.session_id, (d) =>
        placeProp(d.project, d.donor, library(), {
          shape: a.shape, block: a.block, state: a.state, item: a.item, sourceRootId: a.source_root_id, keepAnimation: a.keep_animation,
          name: a.name, position: a.position, rotation: a.rotation, scale: a.scale, size: a.size, color: a.color, parent: a.parent, anchor: a.anchor,
        }));
      return { ...ok(session), ...result };
    },

    place_particles(a: {
      session_id: string; preset: string; sprite?: string; name?: string; position?: V3; parent?: string;
      start_frame?: number; end_frame?: number; amount?: number; color?: string;
    }) {
      const lib = requireLibrary();
      const body = loadPreset(lib, a.preset);
      const { result, session } = store.mutate(a.session_id, (d) =>
        placeParticles(d.project, lib, body, {
          presetName: a.preset, sprite: a.sprite, name: a.name, position: a.position, parent: a.parent,
          startFrame: a.start_frame, endFrame: a.end_frame, amount: a.amount, color: a.color,
        }));
      return { ...ok(session), ...result };
    },

    place_set(a: { session_id: string; source_root_id: string }) {
      const { result, session } = store.mutate(a.session_id, (d) => placeSet(d.project, d.donor, { sourceRootId: a.source_root_id }));
      return { ...ok(session), ...result };
    },

    set_skin(a: { session_id: string; root_id: string; path: string }) {
      const bytes = (() => {
        try {
          return readFileSync(a.path);
        } catch (e) {
          throw new MineimatorError("INVALID_PNG", { path: a.path, reason: (e as Error).message });
        }
      })();
      const size = readPngSize(bytes, a.path);
      const { result, session } = store.mutate(a.session_id, (d) => setSkin(d.project, d.staged, { rootId: a.root_id, sourcePath: a.path, size }));
      return { ...ok(session), ...result };
    },

    add_keyframe(a: { session_id: string; timeline_id: string; frame: number; values: Record<string, number | boolean | string> }) {
      const { result, session } = store.mutate(a.session_id, (d) =>
        addKeyframe(d.project, { timelineId: a.timeline_id, frame: a.frame, values: a.values }));
      return { ...ok(session), ...result };
    },

    set_pose(a: { session_id: string; root_id: string; frame: number; pose: string }) {
      const { result, session } = store.mutate(a.session_id, (d) => setPose(d.project, libraries, { rootId: a.root_id, frame: a.frame, pose: a.pose }));
      return { ...ok(session), ...result };
    },

    set_camera(a: { session_id: string; camera_id?: string; frame: number; position: V3; rotation: V3; fov?: number; activate?: boolean }) {
      const { result, session } = store.mutate(a.session_id, (d) =>
        setCamera(d.project, { cameraId: a.camera_id, frame: a.frame, position: a.position, rotation: a.rotation, fov: a.fov, activate: a.activate }));
      return { ...ok(session), ...result };
    },

    set_shots(a: { session_id: string; shots: Array<{ frame: number; camera_id: string }> }) {
      const { result, session } = store.mutate(a.session_id, (d) => setShots(d.project, a.shots.map((s) => ({ frame: s.frame, cameraId: s.camera_id }))));
      return { ...ok(session), ...result };
    },

    animate_path(a: {
      session_id: string; timeline_id: string; points: Array<{ frame: number; position: V3; transition?: string }>; transition?: string;
      spin?: { axis: "X" | "Y" | "Z"; total_degrees?: number; degrees_per_unit?: number };
    }) {
      const { result, session } = store.mutate(a.session_id, (d) =>
        animatePath(d.project, {
          timelineId: a.timeline_id, points: a.points, transition: a.transition,
          spin: a.spin && { axis: a.spin.axis, totalDegrees: a.spin.total_degrees, degreesPerUnit: a.spin.degrees_per_unit },
        }));
      return { ...ok(session), ...result };
    },

    add_cue(a: { session_id: string; frame?: number; seconds?: number; label: string; kind: CueKind }) {
      const { result, session } = store.mutate(a.session_id, (d) =>
        addCue(d.cues, typeof d.project.project.tempo === "number" ? d.project.project.tempo : 30, { frame: a.frame, seconds: a.seconds, label: a.label, kind: a.kind }));
      return { ...ok(session), cue: result, cues: session.state.cues.length };
    },

    export_cues(a: { session_id: string; path?: string }) {
      const s = store.get(a.session_id);
      const target = a.path ?? (s.savedPath ? cuesPathOf(s.savedPath) : undefined);
      if (!target) throw new MineimatorError("PROJECT_NOT_SAVED");
      const written = writeNewTextFile(JSON.stringify(cuesDocument(s.state.cues, s.state.project.project), null, 2) + "\n", checkDestination(target, config.outputRoot, ".json"));
      return { ...ok(s), path: written, cues: s.state.cues.length };
    },

    set_output(a: { session_id: string; width: number; height: number; tempo: number; length_seconds: number }) {
      const { result, session } = store.mutate(a.session_id, (d) =>
        setOutput(d.project, { width: a.width, height: a.height, tempo: a.tempo, lengthSeconds: a.length_seconds }));
      return { ...ok(session), ...result };
    },

    place_blocks(a: { session_id: string; entries: BlockEntry[]; origin?: V3; parent?: string; name?: string }) {
      const { result, session } = store.mutate(a.session_id, (d) =>
        placeBlocks(d.project, library(), { entries: a.entries, origin: a.origin, parent: a.parent, name: a.name }));
      return { ...ok(session), ...result };
    },

    give_item(a: { session_id: string; character_id: string; hand: "right" | "left"; item: string; name?: string }) {
      const { result, session } = store.mutate(a.session_id, (d) =>
        giveItem(d.project, library(), { characterId: a.character_id, hand: a.hand, item: a.item, name: a.name }));
      return { ...ok(session), ...result };
    },

    set_parent(a: { session_id: string; timeline_id: string; parent: string }) {
      const { result, session } = store.mutate(a.session_id, (d) => setParent(d.project, { timelineId: a.timeline_id, parent: a.parent }));
      return { ...ok(session), ...result };
    },

    set_work_camera(a: { session_id: string; focus: V3; angle_xy: number; angle_z: number; zoom: number; frame?: number }) {
      const { result, session } = store.mutate(a.session_id, (d) =>
        setWorkCamera(d.project, { focus: a.focus, angleXy: a.angle_xy, angleZ: a.angle_z, zoom: a.zoom, frame: a.frame }));
      return { ...ok(session), ...result };
    },

    validate_project(a: { session_id: string }) {
      const s = store.get(a.session_id);
      const issues = validateProject(s.state.project);
      const manifest = buildManifest(s.state.project, s.baseDir, s.state.staged);
      const errors = errorsOf(issues);
      return {
        ...ok(s),
        valid: errors.length === 0,
        errors,
        warnings: [...issues.filter((i) => i.level === "warning"), ...manifestWarnings(s.state.project, manifest)],
        asset_manifest: manifest.map(({ id, type, filename, status }) => ({ id, type, filename, status })),
      };
    },

    save_project(a: { session_id: string; path: string }) {
      const s = store.get(a.session_id);
      const errors = errorsOf(validateProject(s.state.project));
      if (errors.length > 0) {
        throw new MineimatorError("VALIDATION_FAILED", { count: errors.length, first: errors[0].message }, { pointer: errors[0].pointer, details: errors });
      }
      const target = checkDestination(a.path, config.outputRoot);
      // cues go next to the project; check their name first so a clash stops the save before anything is written
      const cuesTarget = s.state.cues.length > 0 ? checkDestination(cuesPathOf(target), config.outputRoot, ".json") : undefined;
      if (cuesTarget && existsSync(cuesTarget)) throw new MineimatorError("DEST_EXISTS", { path: cuesTarget });
      const manifest = buildManifest(s.state.project, s.baseDir, s.state.staged);
      const { filenames, created } = copyAssets(manifest, dirname(target)); // throws MISSING_ASSET before anything is written
      let written: string;
      let cuesWritten: string | undefined;
      try {
        written = writeNewProjectFile(s.state.project, target);
        if (cuesTarget) {
          created.push(written);
          cuesWritten = writeNewTextFile(JSON.stringify(cuesDocument(s.state.cues, s.state.project.project), null, 2) + "\n", cuesTarget);
        }
      } catch (e) {
        for (const file of created) rmSync(file, { force: true });
        throw e;
      }
      s.savedPath = written;
      return {
        ...ok(s),
        path: written,
        sha256: sha256OfFile(written),
        assets: filenames,
        ...(cuesWritten ? { cues_path: cuesWritten } : {}),
        warnings: manifestWarnings(s.state.project, manifest),
      };
    },

    render(a: { session_id: string }) {
      const s = store.get(a.session_id);
      if (!s.savedPath) throw new MineimatorError("PROJECT_NOT_SAVED");
      const p = s.state.project.project;
      const region = (p.timeline as { region_end?: unknown } | undefined)?.region_end;
      const tempo = p.tempo as number;
      const settings = { width: p.video_width as number, height: p.video_height as number, tempo, length_frames: typeof region === "number" ? region : null };
      return {
        ...ok(s),
        status: "manual_required",
        project_path: s.savedPath,
        settings,
        instructions: renderInstructions({
          file: s.savedPath, width: settings.width, height: settings.height, tempo,
          seconds: typeof region === "number" ? region / tempo : undefined,
        }),
      };
    },

    close_project(a: { session_id: string }) {
      return { closed: store.close(a.session_id) };
    },
  };
}

export type Tools = ReturnType<typeof createTools>;
