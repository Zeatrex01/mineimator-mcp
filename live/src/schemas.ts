// Input schemas (zod raw shapes) of the MCP tools.
import { z } from "zod";

export const schemas = {
  launch: {},
  focus: {},
  open_project: {
    path: z.string().min(1).describe("Full path of a .miproject file, e.g. C:\\folder\\scene.miproject. It is only opened, never written."),
    if_unsaved: z.enum(["refuse", "save"]).default("refuse").describe(
      "What to do when the open project has unsaved changes (title shows *). refuse (default): stop and change nothing. save: press Ctrl+S first, which overwrites that project's file.",
    ),
  },
  play: {},
  pause: {},
  go_to_start: {},
  screenshot: {
    focus: z.boolean().default(true).describe("Bring Mine-imator to the front first so nothing covers it (default). false captures what is on screen."),
  },
  press: {
    keys: z.string().min(1).describe("Space-separated chords, e.g. \"ctrl+o\", \"left left\", \"ctrl+shift+s\". Keys: a-z, 0-9, f1-f10, space, enter, tab, esc, backspace, delete, arrows, home, end, pageup, pagedown. Modifiers: ctrl, shift, alt."),
    hold_ms: z.number().int().min(10).max(2000).default(50).describe("How long each key stays down. Holding left/right scrubs the timeline."),
  },
  click: {
    x: z.number().int().min(0).describe("Horizontal pixel, from the left edge of the window's drawing area."),
    y: z.number().int().min(0).describe("Vertical pixel, from the top edge of the window's drawing area."),
    space: z.enum(["window", "screenshot"]).default("window").describe("window: real window pixels. screenshot: pixels of the last downscaled screenshot (scaled back for you)."),
    button: z.enum(["left", "right"]).default("left"),
  },
};
