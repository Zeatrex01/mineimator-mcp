// MCP server: registers the tools, times every call and turns thrown errors into tool errors.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LiveError } from "./errors.ts";
import { schemas } from "./schemas.ts";
import type { Ctx } from "./context.ts";
import { focus } from "./tools/focus.ts";
import { click, press } from "./tools/input.ts";
import { launch } from "./tools/launch.ts";
import { openProject } from "./tools/open-project.ts";
import { goToStart, pause, play } from "./tools/playback.ts";
import { screenshot } from "./tools/screenshot.ts";

type Result = Record<string, unknown> | { data: Record<string, unknown>; image: string };

const isImage = (r: Result): r is { data: Record<string, unknown>; image: string } => "image" in r && typeof r.image === "string";

export function errorPayload(e: unknown, ms: number) {
  if (e instanceof LiveError) return { ok: false, error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) }, ms };
  return { ok: false, error: { code: "INTERNAL_ERROR", message: (e as Error).message }, ms };
}

function wrap<A>(fn: (args: A) => Promise<Result>) {
  return async (args: A) => {
    const t0 = Date.now();
    try {
      const r = await fn(args);
      const ms = Date.now() - t0;
      if (isImage(r)) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ ok: true, ms, ...r.data }, null, 1) },
            { type: "image" as const, data: r.image, mimeType: "image/png" },
          ],
        };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, ms, ...r }, null, 1) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(errorPayload(e, Date.now() - t0), null, 1) }] };
    }
  };
}

export function buildServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: "mineimator-live", version: "0.1.0" });
  const add = <K extends keyof typeof schemas>(name: K, description: string, run: (args: never) => Promise<Result>) =>
    server.registerTool(name, { description, inputSchema: schemas[name] }, wrap(run) as never);

  add("launch", "Start Mine-imator (MINEIMATOR_HOME) if it is not running and wait until its window answers. Returns title and size. Never closes or restarts a running window.", () => launch(ctx));
  add("focus", "Bring the Mine-imator window to the front. Fails loudly if Windows refuses; every input tool does this first.", () => focus(ctx));
  add("open_project", "Open a .miproject in the running Mine-imator: Ctrl+O, type the path in the file dialog, Enter. Refuses by default when the open project has unsaved changes (if_unsaved). Confirms through the window title (the project's inner name, not the file name) and says honestly when it could not.", (a) => openProject(ctx, a as { path: string; if_unsaved?: "refuse" | "save" }));
  add("play", "Start timeline playback (Space). Reads the picture before and after, so it does not toggle playback off by mistake, and reports whether motion was seen.", () => play(ctx));
  add("pause", "Pause timeline playback (Space), only if the picture is changing. Reports whether it stopped.", () => pause(ctx));
  add("go_to_start", "Move the timeline marker to frame 0 and leave playback paused (Enter, Space, Left held). Reports whether playback stopped; the frame itself is not read back.", () => goToStart(ctx));
  add("screenshot", "PNG of the Mine-imator window only (no desktop), at most 960 px tall, taken now and not stored on disk.", (a) => screenshot(ctx, a as { focus?: boolean }));
  add("press", "Low level: send key chords to Mine-imator, e.g. \"ctrl+s\" or \"left left\". Refuses alt+f4, f11, f12.", (a) => press(ctx, a as { keys: string; hold_ms?: number }));
  add("click", "Low level: click at a pixel of the window's drawing area (or of the last screenshot with space \"screenshot\").", (a) => click(ctx, a as { x: number; y: number; space?: "window" | "screenshot"; button?: "left" | "right" }));
  return server;
}
