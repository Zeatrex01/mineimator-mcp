# mineimator-mcp

An [MCP](https://modelcontextprotocol.io) server that lets an AI assistant build and edit
[Mine-imator](https://www.mine-imator.com) scenes. It reads and writes `.miproject` files (format 34, written by
Mine-imator 2.0.2): add characters, mobs, blocks, items and particles from the app's own library, key named poses,
move cameras and cut between them, set the output size, and save a new project that opens in Mine-imator.

It does not render. Mine-imator has no command-line or headless export, and this server never launches or modifies the
application. After saving you open the project and use File > Export movie yourself. The `render` tool says so
(`manual_required`) and lists the steps; it never reports a video that does not exist.

This is the package README. The overview, screenshots and the live-control server are in the [root README](../README.md).

## Install

Requires Node.js 24 or newer. It runs the TypeScript sources directly, so there is no build step.

```
cd mcp
npm install
npm test          # unit and end-to-end tests
npm run check     # type check
```

## Connect

The server speaks MCP over stdio: `node src/main.ts`. Run it from the `mcp` folder or give the full path.

Claude Code, a `.mcp.json` in your project folder:

```json
{
  "mcpServers": {
    "mineimator": {
      "command": "node",
      "args": ["/path/to/mineimator-mcp/mcp/src/main.ts"],
      "env": {
        "MINEIMATOR_HOME": "/path/to/Mine-imator",
        "MINEIMATOR_OUTPUT_ROOT": "/path/to/output-folder"
      }
    }
  }
}
```

Claude Desktop, `claude_desktop_config.json`: the same block (on Windows use forward slashes or doubled backslashes in the paths).

Any other MCP client: start `node src/main.ts` as a stdio server with the environment variables below.

### Configuration

| Variable | Meaning | Default |
|---|---|---|
| `MINEIMATOR_HOME` | Folder of an installed Mine-imator (the one with `Data/` and `Particles/`). Read only. It feeds the built-in library: `list_library`, `place_character library`, `place_prop block/item`, `place_particles`. | unset (shapes and donor copies still work) |
| `MINEIMATOR_OUTPUT_ROOT` | `save_project` may only write below this folder. Symbolic-link escapes are refused. | no restriction |
| `MINEIMATOR_POSES` | Folder of pose-library JSON files. | `data/poses` in this package |
| `MINEIMATOR_ARCHIVE` | Tests only: a folder of real `.miproject` files for the opt-in real-project tests (read only). | unset |

## How to work with it

1. `open_project` with `mode: "new_scene"` on any project: you get an empty scene with that project's settings and
   background. The project also stays in the session as a donor you can copy from; you do not need one for the library.
2. `list_library` shows what Mine-imator ships: characters and mobs (chicken, zombie, villager...), special blocks,
   blocks, items, particle presets and sprites. With donor projects, `list_timelines from: "donor"` and `list_templates`
   show what can be copied.
3. Build the scene from library assets: `place_blocks` (a structure on a block grid), `place_character` (a library model
   by name), `place_prop` (one block or item), `give_item` (an item in a hand), `place_particles` (a library effect),
   then `set_pose`, `add_keyframe` and `animate_path` to animate. Shapes (`place_prop shape`) are for debugging only: a
   sphere is not a meatball and a flat box is not a wall. Donor copies (`place_set`, `source_root_id`) are a second source.
4. Cameras: `set_camera` poses them, `set_shots` cuts between them inside one export, `set_output` sets size and length.
5. `add_cue` notes sounds, text and narrator lines for the editor.
6. `validate_project`, then `save_project` to a new file. Resource files are copied next to it; cues go to `<name>.cues.json`.
7. Open the saved file in Mine-imator and export.

Use `mode: "edit"` to change a copy of a project in memory instead. It is still saved to a new file.

## Tools

Every edit runs on a copy and is kept only if the result still validates. Failures return
`{"error":{"code","message","pointer"},"changed":false}`; success returns `session_id` and `revision`.

| Tool | What it does |
|---|---|
| `open_project` | Load a `.miproject` into a session (`edit` or `new_scene`). Read only. |
| `list_library` | Read the installed Mine-imator: characters and mobs, special blocks, blocks, items, particle presets and sprites, shapes. Omit `kind` for a summary; `kind` gives states, item slots and preset modes. |
| `list_templates` | Rigs and other templates that can be copied, with their root timelines (`source_root_ids`). |
| `list_timelines` | The timelines of the scene (or the donor), optionally below one root or of one type. |
| `place_character` | Add a character. `library: "chicken"` creates the template and body parts the way Mine-imator does from its library (optional `state`, e.g. `{"type":"slim","variant":"alex"}`). `source_root_id` copies a rig from the donor instead (keeps the frame-0 pose, drops the animation). |
| `place_blocks` | Build a structure from real blocks on a block grid: entries of `single`, `line` or `box` (optionally `hollow`), each with a library `block` and `state`; `air` carves cells out. Up to 4000 blocks. See "Placement". |
| `place_prop` | Add one object: `block` + `state` (the position is the block's bottom-centre, or its corner with `anchor: "corner"`), `item`, `source_root_id` (any non-character object of the donor or scene), or `shape` (debug only: cube, cone, cylinder, sphere). |
| `give_item` | Put a library item into the `right` or `left` hand of a built-in human, as a child of the arm part at one fixed offset (`[0,0,-12]` in the arm's space), so it follows the arm. It is a first guess, not a calibrated grip; adjust with `add_keyframe` on the returned `item_id`. |
| `set_parent` | Move a timeline under another one (or `root`). It keeps its own numbers, now read relative to the new parent, so it may jump. Body parts are refused. |
| `place_particles` | Add a spawner from a built-in preset (`Smoke`, `Explosion`, `firework_blast`...), optionally another library `sprite` (`heart`, `glitter`...), with `start_frame`/`end_frame`, `amount`, `color`, `parent`. |
| `place_set` | Copy a set (e.g. a scenery folder) with its animation, fresh ids and the resources it needs. |
| `set_skin` | Give one character a 64x64 or 64x32 PNG skin (a shared template is split first). |
| `add_keyframe` | Set channels on a timeline at a frame: `POS/ROT/SCA`, `BEND_ANGLE`, `VISIBLE`, `ALPHA`, `TRANSITION`, camera settings, `RGB_MUL`. `VISIBLE` works on any timeline and is a step, not a fade: key it `false` at one frame and `true` at another to hide and show. |
| `set_pose` | Write a named pose from a pose library as complete keys on every body part. |
| `set_shots` | Camera cuts in one export: `[{frame, camera_id}]`. Writes `VISIBLE` keys so exactly one camera is visible at every frame. |
| `animate_path` | Move an object through `points` with a transition; optional `spin` (a rolling ball). Built on `add_keyframe`. |
| `add_cue` / `export_cues` | Sound, text and narrator cues (`frame` or `seconds`, `label`, `kind`) kept in the session. `export_cues` and `save_project` write them as JSON next to the project. |
| `set_camera` | Write a camera key or create a camera; `activate` makes it the export camera and hides the others. |
| `set_work_camera` | The free viewport camera the application shows when it opens the project (focus, turn, tilt, distance, optional opening `frame`). Not a scene camera and never rendered; it lets a live screenshot show the scene from a chosen side. |
| `set_output` | Picture size, timeline speed, exported length (`seconds x tempo` must be whole). |
| `validate_project` | Format checks plus the list of resource files. |
| `save_project` | Validate, then write a new `.miproject` and copy its resource files. Never overwrites. |
| `render` | Hand-off: `manual_required` and the export steps. |
| `close_project` | Drop a session. |

Error codes: `INVALID_JSON UNSUPPORTED_FORMAT SESSION_NOT_FOUND ID_NOT_FOUND NOT_CHARACTER EXTERNAL_RIG_LINK ID_EXHAUSTED
INVALID_PNG UNSUPPORTED_SKIN_SIZE UNSUPPORTED_CHANNEL UNSUPPORTED_BEND INVALID_TRANSITION INVALID_VALUE POSE_NOT_FOUND
RIG_MISMATCH NOT_CAMERA HIDDEN_PARENT NONINTEGRAL_DURATION VALIDATION_FAILED DEST_EXISTS DEST_NOT_ALLOWED MISSING_ASSET
IO_ERROR PROJECT_NOT_SAVED LIBRARY_NOT_CONFIGURED LIBRARY_UNREADABLE LIBRARY_ENTRY_NOT_FOUND LIBRARY_STATE_INVALID
PRESET_UNSUPPORTED PROP_UNSUPPORTED SHOT_LIST_INVALID CUT_INSIDE_MOVE PATH_INVALID CUE_INVALID`. The codes are stable; the sentences are not.

### Things worth knowing

- A keyframe starts from the timeline's default values, not from the previous key. Leaving a channel out resets it.
  `set_pose` therefore writes every owned channel explicitly (zero when the pose says nothing).
- Units are scene units (16 = one block) and degrees; Z is up. Camera `ROT_Z` turns clockwise from +Y; positive `ROT_X` looks down.
- Transitions belong to the key they start from (`easeinoutsine`, `easeoutback`, `instant`, ...). `instant` holds until the next key.
- Mine-imator stores no scene length; `set_output` writes the export region `0 .. seconds x tempo`.

## Placement

Where a library object really sits for a given `position`. These were checked in a running Mine-imator 2.0.2 with
`mineimator-live`, using the calibration scene `scripts/calibration-scene.ts` (screenshot:
`../docs/img/placement-calibration.png`, a red marker cube at each requested position).

| Thing | What `position` means | Checked |
|---|---|---|
| Block (`place_prop block`) | Bottom-centre: the block is centred on the position in X and Y (position +-8) and stands from the position's Z up 16. `anchor: "corner"` makes the position the block's minimum X, Y corner instead. | on screen |
| Block cell (`place_blocks`) | Cell `[i,j,k]` occupies 16 units from `origin + 16*[i,j,k]` (Minecraft-style: its minimum corner is at the cell). The tool puts the timeline at the cell's bottom-centre. A floor at `k=0` has its top at Z 16. | on screen |
| Item (`place_prop item`) | Bottom-centre of an upright sprite, 16 units wide, thin in Y, standing on the position's Z. It is not lying flat. | on screen |
| Character or mob (`place_character library`) | Feet: centred on X and Y, feet at Z. The default human is 32 units (2 blocks) tall. | on screen |
| Character facing | Rotation 0 faces +Y; `ROT_Z` 180 faces -Y; `ROT_Z` +90 turns it to face +X (the walk scene). `rotation_z` sets it when placing. | on screen for 0, 90, 180 |
| Screen handedness | Seen from -Y looking toward +Y (the usual front camera), +X is on the left of the picture. Plan accordingly when a set must read left to right. | on screen |
| Shape (debug only) | Its centre. A shape is 16 units across at scale 1. | source only (`temp_update_shape.gml`) |
| Block `facing` states (stairs...) and log `axis` | Which compass word points which way has not been checked. | not checked |
| Particle spawner | Its position is the emitter, drawn as a wire box in the editor. A constant preset streams between `start_frame` and `end_frame`; a burst preset (`firework_blast`) fires once. Seen working while playing (landing dust, a firework burst); a paused still frame shows no particles. | on screen, playing |

Reading the source alone suggested a corner origin for blocks (`builder_generate.gml`, `block_pos = build_pos * block_size`),
but `render_world_tl.gml` then draws the block with a 90-degree turn about Z and a shift of one block in Y ("legacy support"),
and the screen shows it centred. The screen is what counts.

To look at a scene live, `set_work_camera` stores the viewport camera in the project (`angle_xy` 90 looks from -Y toward +Y,
270 from +Y; `angle_z` 0 is level, 89.9 is straight down; `camera_work_set_from.gml`), and `mineimator-live` opens the file and
takes a screenshot. The application keeps playing after a play/pause, so a still check is most reliable when the project is
saved with the `frame` you want to look at.

## Example scenes

Three short scenes built only from the library (the default human, library blocks, items, particles) with a small block set
and one camera each:

- `examples/scenes/walk-cycle.miproject`: 4 s, a sword in the right hand.
- `examples/scenes/run-cycle.miproject`: 3 s.
- `examples/scenes/jump.miproject`: 3 s, a crouch, a firework burst at the apex, a puff of dust on landing.

They are generated by `MINEIMATOR_HOME=<install> node examples/build-scenes.ts`. The script is the worked example of every
tool above. Screenshots of each, taken in Mine-imator, are in `../docs/img/`. The cycles use hand-authored poses
(`walk_a/b`, `run_a/b`, `jump_crouch/air/land`). They read as walking, running and jumping, but they are a first pass, not
polished animation.

## The built-in library

`MINEIMATOR_HOME` points at an installed Mine-imator; the server only reads it. The data comes from
`Data/Minecraft/<version>.midata`, the version named in `Data/settings.midata`. It was read against the install and the source
at `eda12dd`:

| Kind | Where | What the tools do with it |
|---|---|---|
| Characters and mobs (61 in 2.0.2), special blocks (31) | `midata` `characters` / `special_blocks`; part trees in `<version>.zip`, `assets/minecraft/models/character` and `special_block` `*.mimodel` | `place_character library`. The states pick the model file and hide parts (`temp_update_model.gml`). |
| Blocks (285) | `midata` `blocks` (names, state values, `default_state`) | `place_prop block` validates the name and the state. |
| Items (586 named, 596 slots) | `midata` `item_textures` (index = slot; the template stores the name and `project_load_template.gml` resolves it) | `place_prop item`. |
| Particle presets (14), sprites (34) | `Particles/*.miparticles`, `midata` `particles` | `place_particles`. |

How `place_character library` builds a character: Mine-imator makes a template (`action_bench_create.gml`, `temp_duplicate`),
then `temp_animate.gml` creates the root timeline and `tl_new_part.gml` one body-part timeline per model part that is not
hidden, in the order of the model file's flat part list (children before their parent, `model_file_load_part.gml`), and
`tl_update_part_list.gml` moves each part under its parent part. `ops/placeBuiltInCharacter.ts` repeats that. As a check,
for every built-in-model character in a set of real projects (human wide and slim, wolf, villager, iron golem, zombie, witch)
the generated parts, parents, sibling order, `depth`, `lock_bend`, `backfaces`, `parts[]` order, template state and
`model_version` equal what Mine-imator saved. That test is `test/real-projects.test.ts`; it needs `MINEIMATOR_ARCHIVE` and
`MINEIMATOR_HOME` and is skipped otherwise.

A built-in shape is 16 scene units across at scale 1 (radius 8, `temp_update_shape.gml`) and is centred on its position, so a
sphere resting on the floor sits at `z = size / 2`. A constant particle preset emits `spawn_amount` particles per minute; a
burst preset fires once when its key becomes active (`particle_spawner_update.gml`, `tl_update_values.gml`).

## Camera cuts

`set_shots` switches the rendering camera in one export. In the source (`eda12dd`), `app_update_animate.gml` 136-146 runs for
every exported frame and takes the first camera in timeline order that is selected, or visible (`value_inherit[VISIBLE]`) and
not `hide`; `export_update.gml` 60-63 renders through it; `tl_value_interpolate.gml` makes `VISIBLE` a step (`return val1`), so
a `VISIBLE` key on a camera is a cut. The tool writes an explicit `VISIBLE` on every key of every shot camera (a key that
leaves it out resets to "visible"), keys at frame 0 and at each change, and hides the other cameras.

This has not been checked by exporting a movie yet, so export once and watch the cuts. A camera you have selected in the app
wins over the rule (`cam.selected`), so deselect cameras first, as `render` says. Call `set_shots` last, and again after
changing a camera (a hold key it wrote earlier carries the old pose).

## Poses

Pose libraries are JSON in `data/poses/`, described by `data/poses/pose-library.schema.json` (generated from the code with
`npm run build:data`). `human-wide-steve.json` ships for the Steve rig (the built-in `human` with type wide and variant steve):
`neutral`, `surprised`, `thinking`, `relieved`, `hungry`, `lean_to_bite`, `jump_cheer`, `lift_two_hands`, `disappointed`, and
the cycle keys `walk_a`/`walk_b`, `run_a`/`run_b`, `jump_crouch`, `jump_air`, `jump_land`. Every number is hand-authored for
this library (each pose's `provenance` says so). The cycle poses were checked on screen in the example scenes; the emotion
poses were not reviewed on screen.

Add your own file and point `MINEIMATOR_POSES` at the folder. A folder `data/local/` (gitignored) is also read when it exists
and `MINEIMATOR_POSES` is not set: a library there for the same rig adds its poses to the shipped one and wins on a name clash.

## Safety

- It never overwrites. `save_project` refuses an existing file; no tool edits a file in place. Sources are only read.
- Output stays where you allow it, with `MINEIMATOR_OUTPUT_ROOT`.
- Nothing is rendered or launched. No part of this server starts, patches or decompiles Mine-imator.
- A project that fails validation is not saved. A resource file that cannot be found blocks the save.

## Library scene script

`scripts/library-scene.ts` builds a 4 second vertical scene from the built-in library only (a chicken, a block, an item, a
rolling ball, smoke and hearts, two cameras with a cut, one cue) through the MCP tools:

```
MINEIMATOR_HOME=<installed Mine-imator> node scripts/library-scene.ts --out work/library-scene/library-scene.miproject
```

It validates and saves. Whether it looks right (the chicken's size and facing, the smoke, the cut) is only known by opening it
in Mine-imator.

## Development

`docs/ARCHITECTURE.md` explains the layers and [CONTRIBUTING.md](../CONTRIBUTING.md) has the rules. Tests: `npm test`.
Real-project tests are opt-in: set `MINEIMATOR_ARCHIVE` to a folder of `.miproject` files (read only).
`examples/generic-scene.miproject` is a generated, made-up scene used by the tests.

## Roadmap

Not built yet, roughly by value:

1. More rigs and poses: slim and mob pose libraries, interpolation-aware key insertion, copying and retiming animations.
2. Library skins and textures (resource packs), custom models, scenery from schematics, material authoring, text and light timelines.
3. Audio timelines, last. Sound effects are usually added after the render in a video editor, so cues (`add_cue`) come first.

## License

MIT, see the [LICENSE](../LICENSE) in the repository root.
