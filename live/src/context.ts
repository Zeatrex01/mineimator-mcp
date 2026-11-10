// Shared state of one server run, and the window helpers every tool uses.
import { LiveError } from "./errors.ts";
import type { LiveConfig } from "./config.ts";
import type { Rect, ShotGeometry } from "./coords.ts";
import type { Worker } from "./ps/client.ts";

export interface Ctx {
  cfg: LiveConfig;
  worker: Worker;
  /** Geometry of the last screenshot, so a click can be given in screenshot pixels. */
  lastShot?: ShotGeometry;
}

export interface WinInfo {
  found: boolean;
  process_running?: boolean;
  pid: number;
  hwnd: number;
  title: string;
  minimized: boolean;
  foreground: boolean;
  hung: boolean;
  dpi: number;
  window: Rect;
  client: Rect;
}

export const findWindow = (ctx: Ctx) => ctx.worker.call<WinInfo>("find", { exe: ctx.cfg.exe });

export async function requireWindow(ctx: Ctx): Promise<WinInfo> {
  const w = await findWindow(ctx);
  if (!w.found) throw new LiveError("NOT_RUNNING", "Mine-imator has no window. Call launch first.");
  return w;
}

/** Brings the window to the front and proves it: throws FOCUS_FAILED instead of letting input go elsewhere. */
export async function ensureFocused(ctx: Ctx): Promise<WinInfo & { focus_method: string }> {
  const w = await requireWindow(ctx);
  if (w.foreground && !w.minimized) return { ...w, focus_method: "already" };
  const f = await ctx.worker.call<{ foreground: boolean; method: string }>("focus", { hwnd: w.hwnd });
  if (!f.foreground) {
    throw new LiveError("FOCUS_FAILED", "Windows refused to bring Mine-imator to the front (method " + f.method + "). No input was sent.");
  }
  return { ...(await requireWindow(ctx)), focus_method: f.method };
}

export const sizeOf = (w: WinInfo) => ({ width: w.client.w, height: w.client.h });
