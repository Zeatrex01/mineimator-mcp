// Every user-facing sentence of the server lives here, in English, so wording stays consistent.
// Error codes are the stable contract; the sentences may be reworded without breaking clients.

export type Params = Record<string, string | number | boolean | undefined>;

export const errorMessages = {
  // Loading and format
  INVALID_JSON: (p: Params) => `The file is not valid JSON: ${p.reason}`,
  UNSUPPORTED_FORMAT: (p: Params) => `This is not a supported Mine-imator project: ${p.reason}`,
  // Sessions and lookups
  SESSION_NOT_FOUND: (p: Params) => `There is no open session "${p.session}". Call open_project first.`,
  ID_NOT_FOUND: (p: Params) => `No ${p.kind ?? "object"} with id "${p.id}" exists here.`,
  // Cloning and placement
  NOT_CHARACTER: (p: Params) => `"${p.id}" is a ${p.type}, not a character (type "char").`,
  EXTERNAL_RIG_LINK: (p: Params) =>
    `"${p.id}" is linked to "${p.target}", which lies outside the object being copied. Copying it would break the link.`,
  ID_EXHAUSTED: () => "Could not generate a free id.",
  // Skins
  INVALID_PNG: (p: Params) => `"${p.path}" is not a readable PNG image: ${p.reason}`,
  UNSUPPORTED_SKIN_SIZE: (p: Params) =>
    `The skin is ${p.width}x${p.height}. Only 64x64 and 64x32 skins are supported for now.`,
  // Keyframes and poses
  UNSUPPORTED_CHANNEL: (p: Params) => `The channel "${p.channel}" is not supported here (${p.reason}).`,
  UNSUPPORTED_BEND: (p: Params) => `"${p.timeline}" cannot use ${p.channel}: only the human body bends on X, Y and Z and arms/legs on X.`,
  INVALID_TRANSITION: (p: Params) => `"${p.value}" is not a Mine-imator transition name.`,
  INVALID_VALUE: (p: Params) => `Invalid value for ${p.channel}: ${p.reason}`,
  POSE_NOT_FOUND: (p: Params) => `There is no pose named "${p.pose}" for this rig. Known poses: ${p.known}.`,
  RIG_MISMATCH: (p: Params) => `No pose library fits the rig "${p.rig}" (${p.reason}).`,
  // Cameras and output
  NOT_CAMERA: (p: Params) => `"${p.id}" is a ${p.type}, not a camera.`,
  HIDDEN_PARENT: (p: Params) => `The camera "${p.id}" sits inside a hidden parent ("${p.parent}"), so it could never be the export camera.`,
  NONINTEGRAL_DURATION: (p: Params) => `${p.seconds} s at ${p.tempo} frames per second is ${p.frames} frames, which is not a whole number.`,
  // Saving
  VALIDATION_FAILED: (p: Params) => `The project has ${p.count} error(s) and was not saved. First: ${p.first}`,
  DEST_EXISTS: (p: Params) => `"${p.path}" already exists. Saving never overwrites; choose a new file name.`,
  DEST_NOT_ALLOWED: (p: Params) => `${p.reason}`,
  MISSING_ASSET: (p: Params) => `The resource file "${p.filename}" was not found next to the source project.`,
  IO_ERROR: (p: Params) => `File system error: ${p.reason}`,
  // Built-in library (read from the installed Mine-imator)
  LIBRARY_NOT_CONFIGURED: () =>
    "The built-in library needs MINEIMATOR_HOME, the folder of an installed Mine-imator (the one that contains Data/ and Particles/). Set it in the server's environment.",
  LIBRARY_UNREADABLE: (p: Params) => `The Mine-imator library could not be read: ${p.reason}`,
  LIBRARY_ENTRY_NOT_FOUND: (p: Params) => `The library has no ${p.kind} named "${p.name}". Close matches: ${p.near}.`,
  LIBRARY_STATE_INVALID: (p: Params) => `"${p.name}" state "${p.state}": ${p.reason}.`,
  PRESET_UNSUPPORTED: (p: Params) => `The particle preset "${p.name}" cannot be placed: ${p.reason}.`,
  // Props
  PROP_UNSUPPORTED: (p: Params) => `"${p.id}" cannot be copied as a prop: ${p.reason}.`,
  // Shots and paths
  SHOT_LIST_INVALID: (p: Params) => `The shot list is not usable: ${p.reason}.`,
  CUT_INSIDE_MOVE: (p: Params) =>
    `The camera "${p.camera}" moves between frames ${p.from} and ${p.to}, so a cut at frame ${p.frame} needs a key there. Add one with set_camera at frame ${p.frame} first.`,
  PATH_INVALID: (p: Params) => `The path is not usable: ${p.reason}.`,
  CUE_INVALID: (p: Params) => `The cue is not usable: ${p.reason}.`,
  // Rendering
  PROJECT_NOT_SAVED: () => "Save the project with save_project before asking how to render it.",
} as const satisfies Record<string, (p: Params) => string>;

export type ErrorCode = keyof typeof errorMessages;

export const warningMessages = {
  FIRST_KEY_AFTER_ZERO: (p: Params) => `The first key of "${p.id}" is at frame ${p.frame}, not 0; frame 0 was taken as the timeline defaults.`,
  SKIN_MASKED: (p: Params) => `${p.reason} The new skin may not show.`,
  FOV_CARRIED: (p: Params) => `CAM_FOV ${p.fov} was copied from the nearest key so the field of view does not jump back to the default.`,
  UNKNOWN_BEND_RIG: (p: Params) => `${p.reason}`,
  MISSING_ASSET: (p: Params) => `Resource file "${p.filename}" is missing; the project will not load it.`,
  CACHE_ONLY: (p: Params) => `"${p.filename}" is loaded from its .meshcache only; the original world or schematic is not copied.`,
  PROP_VALUES_KEYED: (p: Params) => `"${p.id}" keeps its own keyframes, and a key that sets position, rotation, scale or colour wins over the resting value you passed.`,
  CUT_HOLD_KEY: (p: Params) => `Camera "${p.camera}" got a hold key at frame ${p.frame} copied from its key at frame ${p.from}; if you change that camera later, run set_shots again.`,
  PRESET_RESOURCE_SKIPPED: (p: Params) => `${p.reason}`,
  ABSOLUTE_WORLD_PATH: (p: Params) => `Resource "${p.id}" points to the folder "${p.dir}" on the machine that made it.`,
} as const satisfies Record<string, (p: Params) => string>;

export type WarningCode = keyof typeof warningMessages;

/** Instructions returned by the render tool. Rendering is never automated. */
export function renderInstructions(p: { file: string; width: number; height: number; tempo: number; seconds?: number }): string[] {
  return [
    `Open ${p.file} in Mine-imator.`,
    "In the timeline, deselect every camera so the project's export camera is used.",
    `Check the shot in the viewport. The project is ${p.width}x${p.height} at ${p.tempo} timeline frames per second` +
      (p.seconds === undefined ? "." : ` (${p.seconds} s).`),
    "Choose File > Export movie, pick the frame rate and format, and export.",
    "Verify the exported duration. Nothing has been rendered by this server.",
  ];
}
