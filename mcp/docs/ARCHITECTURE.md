# Architecture

Three layers. A layer may import only from the layers above it in this list.

```
src/
  core/        the .miproject format: no MCP, no tool names
  ops/         one file per operation, pure functions on a project object
  mcp/         sessions, schemas, handlers, server: wires ops to MCP tools
  config.ts    environment variables -> Config
  main.ts      entry point (stdio)
data/poses/    pose libraries (JSON) + generated JSON Schema
examples/      a generic scene and three example scenes (generated)
scripts/       generators and example scripts (MCP clients)
test/
```

## core/ - the format

| File | Concern |
|---|---|
| `project.ts` | Types (`Project`, `Timeline`, ...), `parseProject`, lookups, `subtreeOf`. No file access. |
| `format.ts` | Facts about format v34: transitions, channel catalogue, bend rules, rig ids. |
| `ids.ts` | 16-character `0-9A-Z` ids and the reserved words (`root`, `null`, `default`...). |
| `validate/` | Rule groups (`structure`, `references`, `rigs`, `keyframes`, `cameras`). `validateProject` returns issues with a code and a JSON pointer. |
| `io.ts` | Reading, exclusive writing (never replaces a file), output-root check. |
| `assets.ts` | Which resource files a project needs; copying them next to a saved project. |
| `png.ts` | Skin size from the PNG header. |
| `poseLibrary.ts` | The pose-library schema (zod), loading, JSON Schema generation. |
| `library.ts`, `zip.ts` | The built-in library of an installed Mine-imator, read only: `.midata` lists, `.mimodel` part trees (read from the asset zip by the small zip reader), particle presets. `resolveModel` picks the model file and hidden parts for a state. |
| `timelineDefaults.ts` | `newTimeline`: the fields Mine-imator writes for a new timeline of each type; `attachTo`. |
| `errors.ts`, `messages.ts` | `MineimatorError` with a stable `code`; every sentence the server says, in English, in one file. |

## ops/ - operations

One file per tool: `placeCharacter` (donor copy), `placeBuiltInCharacter` (library model), `placeProp`, `placeBlocks` (block grid), `giveItem`, `setParent`, `setWorkCamera`, `placeParticles`, `placeSet`, `setSkin`, `addKeyframe`,
`animatePath` (on `addKeyframe`), `setPose`, `setCamera`, `setShots`, `setOutput`, `listLibrary`, `listTemplates`, `listTimelines`, `cues` (add and the cues.json document), plus `newScene`. Shared helpers: `cloneTree` (copy a subtree with
fresh ids), `channels` (value validation), `source` (find an object in the scene or the donor).

An op takes a `Project` (and plain data such as pose libraries), changes it in place, and returns a result.
It never touches the file system and never imports from `mcp/`. That is what makes it testable on a plain object
and reusable from a script, a CLI or another server.

## mcp/ - the wiring

- `sessions.ts` - `SessionStore`. `mutate()` runs an op on a copy of the project and keeps the copy only if
  `validateProject` finds no error, so a failed edit changes nothing and costs no revision.
- `tools.ts` - holds the lazily loaded library (`MINEIMATOR_HOME`) and one handler per tool: looks up the session, reads files if the tool needs them (the PNG for
  `set_skin`), calls the op, adds `session_id` and `revision`.
- `schemas.ts` - zod input schemas. `server.ts` - registers tools and turns `MineimatorError` into
  `{error:{code,message,pointer},changed:false}`.

## Rules that keep it clean

1. No MCP import below `mcp/`. No file access in `ops/`.
2. No machine-specific path in `src/`. Locations come from `config.ts` (environment variables).
3. Every failure is a `MineimatorError` with a code from `messages.ts`. Codes are the contract; sentences may change.
4. Every user-facing sentence is English and lives in `messages.ts`.
5. Data (poses, example) is JSON with a schema or a generator, not code.
6. Unknown fields in a `.miproject` are kept untouched.

## Adding an operation

1. `src/ops/yourOp.ts`: a pure function `(project, args) => result`.
2. If it can fail in a new way, add a code to `errorMessages` in `core/messages.ts`.
3. `src/mcp/schemas.ts`: the input schema. `src/mcp/tools.ts`: the handler (`store.mutate(...)` for an edit).
4. `src/mcp/server.ts`: one `add(...)` line with the tool description.
5. A test in `test/ops.test.ts` (and one in `test/server.test.ts` if the wiring is special).
6. A line in the README tool table and in the root `CHANGELOG.md`.

## How the built-in library plugs in

`MINEIMATOR_HOME` loads into `Config.mineimatorHome`. `core/library.ts` reads `<home>/Data/Minecraft/<version>.midata` (lists), the zip next to it
(`.mimodel` part trees) and `<home>/Particles` (presets) into plain data (`LibraryData`). Ops stay free of file access: the handler resolves what is
needed (`resolveModel`, `loadPreset`) and passes plain data in, so `placeBuiltInCharacter`, `placeProp` and `placeParticles` are tested on made-up installs
(`makeFakeHome` in `test/helpers.ts`) and, when `MINEIMATOR_HOME` is set, on the real one. Donor copies (`place_character source_root_id`, `place_prop source_root_id`,
`place_set`) remain the second source.

## Session state outside the project

A session also holds the cues (`add_cue`): sound, text and narrator notes for the video editor. They are not part of the `.miproject`; `save_project` and
`export_cues` write them as a separate JSON file (`ops/cues.ts` builds the document).

## Camera cuts

`set_shots` (`ops/setShots.ts`) works on visibility keys because the export takes the first visible camera of each frame; the reasoning and the source lines
are in the file header and in the README. `core/validate/cameras.ts` understands the result: several non-hidden cameras are fine when exactly one is visible at every key frame.
