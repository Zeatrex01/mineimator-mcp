import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { LiveError } from "../errors.ts";
import { findWindow, sizeOf, type Ctx } from "../context.ts";
import { sleep, waitFor } from "../util.ts";

const WINDOW_TIMEOUT_MS = 60_000;

export async function launch(ctx: Ctx) {
  const t0 = Date.now();
  let win = await findWindow(ctx);
  const already = win.found || Boolean(win.process_running);
  if (!already) {
    if (!existsSync(ctx.cfg.exe)) {
      throw new LiveError("NOT_INSTALLED", `Mine-imator.exe not found at ${ctx.cfg.exe}. Set MINEIMATOR_HOME to its folder.`);
    }
    // Detached so the app outlives this server; the user's window is never closed by us.
    spawn(ctx.cfg.exe, [], { cwd: ctx.cfg.home, detached: true, stdio: "ignore" }).unref();
  }
  const up = await waitFor(async () => {
    const w = await findWindow(ctx);
    return w.found ? w : undefined;
  }, WINDOW_TIMEOUT_MS);
  if (!up) throw new LiveError("LAUNCH_TIMEOUT", `No Mine-imator window within ${WINDOW_TIMEOUT_MS / 1000} s.`);
  // Wait until the window answers messages (it is busy while loading assets).
  const ready = await waitFor(async () => {
    const w = await findWindow(ctx);
    if (!w.found || w.hung) return undefined;
    await sleep(300);
    const again = await findWindow(ctx);
    return again.found && !again.hung ? again : undefined;
  }, WINDOW_TIMEOUT_MS, 200);
  win = ready ?? up;
  return {
    already_running: already,
    pid: win.pid,
    title: win.title,
    ...sizeOf(win),
    dpi: win.dpi,
    responsive: Boolean(ready),
    launch_ms: Date.now() - t0,
  };
}
