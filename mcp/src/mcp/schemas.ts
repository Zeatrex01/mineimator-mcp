// Input schemas of the MCP tools (zod), kept apart from the wiring in server.ts.
import { z } from "zod";

export const session_id = z.string().describe("Session id returned by open_project.");
const id = z.string().min(1);
const frame = z.number().int().min(0).describe("Timeline frame, a whole number from 0.");
const v3 = z.tuple([z.number(), z.number(), z.number()]).describe("[X, Y, Z] in scene units (16 units = 1 block, Z is up).");

export const schemas = {
  open_project: {
    path: z.string().describe("Path of a .miproject file. It is only read."),
    mode: z.enum(["edit", "new_scene"]).default("edit").describe(
      "edit: work on a copy of the project. new_scene: start an empty scene with the project's settings and background and keep the project as a donor to copy from.",
    ),
  },
  list_templates: {
    session_id,
    type: z.string().optional().describe("Only templates of this type, e.g. char."),
  },
  list_timelines: {
    session_id,
    root_id: id.optional().describe("Only this timeline and everything below it."),
    type: z.string().optional().describe("Only timelines of this type, e.g. char, bodypart, camera."),
    from: z.enum(["scene", "donor"]).default("scene").describe("donor: list the project a new_scene session copies from, to find characters and sets to place."),
  },
  list_library: {
    kind: z.enum(["characters", "special_blocks", "blocks", "items", "particles", "shapes"]).optional()
      .describe("What to list in detail. Omit for a summary of every kind."),
    search: z.string().optional().describe("Only names containing this text."),
    limit: z.number().int().min(1).max(1000).default(80).describe("Most rows to return for one kind."),
  },
  place_character: {
    session_id,
    source_root_id: id.optional().describe("Copy a character from the donor project or scene (see list_templates source_root_ids). Give this or library."),
    library: z.string().optional().describe("Add a built-in character, mob or special block of Mine-imator by name, e.g. chicken, zombie, villager, human, chest (see list_library). Give this or source_root_id."),
    state: z.record(z.string(), z.string()).optional().describe("Library models only: state values, e.g. {\"variant\":\"alex\"} or {\"type\":\"slim\"}. Omitted states use the model's defaults."),
    name: z.string().describe("Name of the new character."),
    position: v3.describe("Where the character's feet are: centred on X and Y, feet at Z (a Z of 0 stands on the ground)."),
    rotation_z: z.number().optional().describe("Library models only: turn about Z in degrees. 0 faces +Y, 180 faces -Y. Which way a positive angle turns is not verified."),
  },
  place_prop: {
    session_id,
    shape: z.enum(["cube", "cone", "cylinder", "sphere"]).optional().describe("A built-in shape. Give exactly one of shape, block, item, source_root_id."),
    block: z.string().optional().describe("A built-in block by name, e.g. planks, cake, glass (see list_library)."),
    state: z.record(z.string(), z.string()).optional().describe("Block state values, e.g. {\"variant\":\"oak\"}. Omitted states use the block's defaults."),
    item: z.string().optional().describe("A built-in item by name, e.g. bread, cooked_beef, apple (see list_library kind items)."),
    source_root_id: id.optional().describe("Copy a non-character object (item, block, scenery, folder...) from the scene or donor instead."),
    keep_animation: z.boolean().default(false).describe("Copy only: keep the source's keyframes (default: keep its frame-0 look and drop the animation)."),
    name: z.string().optional(),
    position: v3.optional().describe("Blocks: the bottom-centre of the block by default (anchor corner: its minimum X, Y corner). Items: bottom-centre of the upright sprite. Shapes: their centre."),
    anchor: z.enum(["bottom_center", "corner"]).optional().describe("Blocks only: what position means. bottom_center (default) is how Mine-imator places a block; corner is the block's minimum X, Y, bottom corner."),
    rotation: v3.optional().describe("[X, Y, Z] degrees."),
    scale: z.union([z.number().positive(), v3]).optional().describe("Multiplier on all axes, or per axis. A shape is 16 units across at scale 1."),
    size: z.number().positive().optional().describe("Shapes only: width in scene units (the diameter of a sphere). Sets the scale; do not combine with scale."),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe("#RRGGBB colour multiplied over the texture; a shape has no texture, so this is its colour."),
    parent: id.optional().describe("Attach under this timeline; position is then relative to it."),
  },
  place_particles: {
    session_id,
    preset: z.string().describe("A built-in particle preset by name, e.g. Smoke, Explosion, firework_blast (see list_library kind particles)."),
    sprite: z.string().optional().describe("Replace the sprite of every library-sprite particle in the preset, e.g. heart, glitter, spark, flame (see list_library)."),
    name: z.string().optional(),
    position: v3.optional(),
    parent: id.optional().describe("Attach under this timeline (for example the object the effect follows)."),
    start_frame: z.number().int().min(0).default(0).describe("Frame at which the effect starts."),
    end_frame: z.number().int().min(1).optional().describe("Constant presets (smoke, fire): frame at which spawning stops. Bursts (explosions) fire once at start_frame."),
    amount: z.number().positive().optional().describe("Replace the preset's spawn amount: particles per MINUTE for a constant preset, particles per burst for a burst preset."),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe("#RRGGBB tint of the effect."),
  },
  place_set: {
    session_id,
    source_root_id: id.describe("Root timeline of the set to copy, e.g. a scenery folder of the donor project."),
  },
  set_skin: {
    session_id,
    root_id: id.describe("Root timeline of the character."),
    path: z.string().describe("Path of a 64x64 or 64x32 PNG skin."),
  },
  add_keyframe: {
    session_id,
    timeline_id: id,
    frame,
    values: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).refine((v) => Object.keys(v).length > 0, "at least one channel")
      .describe("Channels to set, e.g. {\"ROT_X\": -30, \"TRANSITION\": \"easeinoutsine\"}. Channels you leave out reset to the timeline defaults for this key."),
  },
  set_pose: {
    session_id,
    root_id: id.describe("Root timeline of the character."),
    frame,
    pose: z.string().describe("Pose name from the pose library."),
  },
  set_camera: {
    session_id,
    camera_id: id.optional().describe("Camera to edit. Omit to create a new camera."),
    frame,
    position: v3,
    rotation: v3.describe("[X, Y, Z] degrees. Z turns clockwise from +Y; positive X looks down."),
    fov: z.number().min(1).max(170).optional().describe("Vertical field of view in degrees."),
    activate: z.boolean().default(false).describe("Make this the export camera: show it, hide every other camera."),
  },
  set_shots: {
    session_id,
    shots: z.array(z.object({
      frame,
      camera_id: id.describe("The camera that renders from this frame on."),
    })).min(1).describe("Shot list in time order; the first shot starts at frame 0. A camera may appear in several shots."),
  },
  animate_path: {
    session_id,
    timeline_id: id.describe("The object to move (a prop, a character root, a camera...)."),
    points: z.array(z.object({
      frame,
      position: v3,
      transition: z.string().optional().describe("Transition of the move that starts at this point (overrides the default)."),
    })).min(2).describe("Where the object is at which frame, in time order."),
    transition: z.string().default("linear").describe("Default transition of every move, e.g. linear, easeinquad, easeoutbounce, easeoutback."),
    spin: z.object({
      axis: z.enum(["X", "Y", "Z"]).describe("Rotation axis (Z is up). A ball rolling along +Y spins about X."),
      total_degrees: z.number().optional().describe("Total turn over the whole path, shared out by distance."),
      degrees_per_unit: z.number().optional().describe("Turn per scene unit travelled; a ball of radius r rolls 180 / (pi * r)."),
    }).optional().describe("Roll or spin while moving. Give total_degrees or degrees_per_unit."),
  },
  add_cue: {
    session_id,
    frame: frame.optional(),
    seconds: z.number().min(0).optional().describe("Alternative to frame; rounded to the nearest frame at the project's tempo."),
    label: z.string().min(1).describe("What happens: the sound's name, the text, or the narrator line."),
    kind: z.enum(["sfx", "text", "narrator"]),
  },
  export_cues: {
    session_id,
    path: z.string().optional().describe("New .json file. Default: <saved project name>.cues.json next to the saved project."),
  },
  set_output: {
    session_id,
    width: z.number().int().min(1),
    height: z.number().int().min(1),
    tempo: z.number().positive().describe("Timeline frames per second (the export frame rate is chosen at export time)."),
    length_seconds: z.number().positive().describe("Length of the exported range; seconds x tempo must be a whole number."),
  },
  place_blocks: {
    session_id,
    entries: z.array(z.object({
      kind: z.enum(["single", "line", "box"]).describe("single: the cell `from`. line: `from` to `to` along one axis. box: the cuboid between `from` and `to`, inclusive."),
      block: z.string().describe("A built-in block by name (see list_library kind blocks), or air to remove cells set by an earlier entry."),
      state: z.record(z.string(), z.string()).optional().describe("Block state values, e.g. {\"variant\":\"oak\"}."),
      from: z.tuple([z.number().int(), z.number().int(), z.number().int()]).describe("Block cell [i, j, k]. Cell [0,0,0] occupies 0..16 in X, Y and Z from `origin`."),
      to: z.tuple([z.number().int(), z.number().int(), z.number().int()]).optional().describe("Line and box: the other end cell."),
      hollow: z.boolean().default(false).describe("Box only: only the outer shell."),
    })).min(1),
    origin: v3.optional().describe("Scene position of the minimum corner of cell [0,0,0]. Default [0, 0, 0]."),
    parent: id.optional().describe("Attach every block under this timeline."),
    name: z.string().optional().describe("Prefix of the timeline names (default block)."),
  },
  give_item: {
    session_id,
    character_id: id.describe("Root timeline of a character that has right_arm and left_arm parts (the built-in human)."),
    hand: z.enum(["right", "left"]),
    item: z.string().describe("A built-in item by name, e.g. diamond_sword, bread (see list_library kind items)."),
    name: z.string().optional(),
  },
  set_parent: {
    session_id,
    timeline_id: id,
    parent: z.string().describe("A timeline id, or root for the top level. The timeline keeps its own numbers, read relative to the new parent; the world position is not preserved."),
  },
  set_work_camera: {
    session_id,
    focus: v3.describe("The point the viewport looks at, [X, Y, Z] in scene units."),
    angle_xy: z.number().describe("Turn around the focus, degrees."),
    angle_z: z.number().describe("Tilt above or below the focus, degrees."),
    zoom: z.number().min(1).describe("Distance from the focus, scene units."),
    frame: z.number().int().min(0).optional().describe("The frame the application opens the project at (the timeline marker). Omit to leave it."),
  },
  validate_project: { session_id },
  save_project: { session_id, path: z.string().describe("New .miproject path. An existing file is never replaced.") },
  render: { session_id },
  close_project: { session_id },
} as const;
