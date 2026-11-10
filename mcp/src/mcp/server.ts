// MCP server over stdio: registers every tool and turns thrown errors into tool errors.
// Built here, started by src/main.ts. All logic lives in tools.ts and below.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MineimatorError } from "../core/errors.ts";
import { schemas } from "./schemas.ts";
import type { Tools } from "./tools.ts";

/** Tool errors carry the stable code: {error:{code,message,pointer,details?},changed:false}. */
export function errorPayload(e: unknown) {
  if (e instanceof MineimatorError) {
    return { error: { code: e.code, message: e.message, pointer: e.pointer ?? null, ...(e.details ? { details: e.details } : {}) }, changed: false };
  }
  return { error: { code: "INTERNAL_ERROR", message: (e as Error).message, pointer: null }, changed: false };
}

function wrap<A>(fn: (args: A) => unknown) {
  return async (args: A) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(fn(args), null, 1) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(errorPayload(e), null, 1) }] };
    }
  };
}

export function buildServer(tools: Tools): McpServer {
  const server = new McpServer({ name: "mineimator", version: "0.1.0" });
  const poseNames = tools.libraries.flatMap((l) => Object.keys(l.poses).map((p) => `${p} (${l.rig})`)).join(", ");

  const handlers = tools as unknown as Record<string, (args: never) => unknown>;
  const add = (name: keyof typeof schemas, description: string) =>
    server.registerTool(name, { description, inputSchema: schemas[name] }, wrap((args: never) => handlers[name](args)) as never);

  add("open_project", "Load a .miproject into an editing session. The file is only read. mode new_scene starts an empty scene and keeps the project as a donor to copy characters and sets from. Returns the session id.");
  add("list_templates", "List the character rigs and other templates that can be copied: id, type, model, skin and the root timelines that use them (source_root_ids). Includes the donor project after new_scene.");
  add("list_timelines", "List the timelines (characters, body parts, cameras, scenery...) of the open scene or, with from donor, of the project a new_scene session copies from. Optionally below one root or of one type.");
  add("list_library", "List what the installed Mine-imator ships (read only, needs MINEIMATOR_HOME): built-in characters and mobs (chicken, zombie, villager...), special blocks, blocks, items, particle presets and sprites, shapes. Omit kind for a summary.");
  add("place_character", "Add a character: either a built-in model of Mine-imator by name (library, for example chicken, zombie, villager, human; created exactly as the app does from its library) or a copy of a character from the donor project (source_root_id). The new character gets its own template and body parts at a position; a copy keeps the source's frame-0 pose and drops its animation.");
  add("place_prop", "Add one object: a built-in shape (cube, cone, cylinder, sphere), a built-in block or item by name (see list_library), or a copy of a non-character object from the donor or scene (source_root_id). Position, rotation, scale and colour become its resting values; animate it with add_keyframe or animate_path.");
  add("place_particles", "Add a particle spawner from one of Mine-imator's built-in presets (Smoke, Explosion, firework_blast, fire...), optionally with another library sprite (heart, glitter...), at a position and frame range. Constant presets stream between start_frame and end_frame; burst presets fire once at start_frame.");
  add("place_set", "Copy a set (for example a scenery folder) from the open scene or the donor project, animation and position included, with fresh ids.");
  add("set_skin", "Give one character a 64x64 or 64x32 PNG skin. Only that character changes; the PNG is copied next to the project when it is saved.");
  add("add_keyframe", "Set channels on one timeline at one frame (POS/ROT/SCA, BEND_ANGLE, VISIBLE, ALPHA, TRANSITION, camera settings). A key starts from the timeline defaults; it does not carry the previous pose.");
  add("set_pose", `Write a named pose onto a character at a frame as complete keys on every body part. Poses: ${poseNames || "none loaded"}.`);
  add("set_camera", "Write one camera key (position, rotation, optional field of view). Omit camera_id to create a camera. activate makes it the export camera and hides the others.");
  add("set_shots", "Cut between cameras inside one export: a list of {frame, camera_id}. Writes visibility keys so exactly one camera is visible at every frame (Mine-imator renders through the first visible camera each frame). Run it last, after the cameras are posed; run it again if you change a camera.");
  add("animate_path", "Move an object through points over frames with a transition (linear, easeinquad, easeoutbounce...), optionally spinning it (a rolling ball). Writes position keys with add_keyframe's rules.");
  add("add_cue", "Note a sound effect, on-screen text or narrator line at a frame or time for the video editor. Cues are kept in the session, not in the .miproject.");
  add("export_cues", "Write the cues as a new cues.json (frame, seconds, label, kind), by default next to the saved project. save_project also writes <project>.cues.json when cues exist.");
  add("place_blocks", "Build a structure from real Minecraft blocks on a block grid: entries of kind single, line or box (box can be hollow), each with a library block and state. Cell [i,j,k] occupies 16 units from origin + 16*[i,j,k]; block air carves cells out. Use this for sets (floors, walls, houses) instead of shapes, which are debug only.");
  add("give_item", "Put a library item (diamond_sword, bread...) into the right or left hand of a built-in human: it becomes a child of the arm part at one fixed offset, so it follows the arm's pose. The offset is a first guess, not a calibrated grip.");
  add("set_parent", "Move a timeline under another (or to root). Simple: the timeline keeps its numbers, now relative to the new parent, so it may jump; the world position is not preserved. Body parts and cycles are refused.");
  add("set_work_camera", "Set the free viewport camera that Mine-imator shows when the project is opened (focus point, turn, tilt, distance). It is not a scene camera and is never rendered; use it so a live screenshot shows the scene from a chosen side.");
  add("set_output", "Set the picture size, timeline speed and exported length (frames = seconds x tempo, must be whole).");
  add("validate_project", "Check the open scene against the format rules and list its resource files. Errors block saving.");
  add("save_project", "Validate, then write a NEW .miproject and copy the resource files it uses next to it. An existing file is never replaced.");
  add("render", "Mine-imator cannot render from the command line. After a save this returns status manual_required and the steps to export by hand.");
  add("close_project", "Drop an editing session without saving.");
  return server;
}

