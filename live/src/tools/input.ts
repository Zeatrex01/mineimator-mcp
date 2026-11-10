// press and click: the low-level fallbacks. Both focus first and refuse if the window is not in front.
import { clientToScreen, shotToClient } from "../coords.ts";
import { LiveError } from "../errors.ts";
import { parseKeys } from "../keys.ts";
import { ensureFocused, type Ctx } from "../context.ts";

export async function press(ctx: Ctx, args: { keys: string; hold_ms?: number }) {
  const chords = parseKeys(args.keys);
  const w = await ensureFocused(ctx);
  const r = await ctx.worker.call<{ chords_sent: number }>("keys", {
    pid: w.pid,
    chords: chords.map((c) => ({ mods: c.mods, key: c.key })),
    hold_ms: args.hold_ms ?? 50,
  });
  return { sent: chords.map((c) => c.label), chords_sent: r.chords_sent };
}

export async function click(ctx: Ctx, args: { x: number; y: number; space?: "window" | "screenshot"; button?: "left" | "right" }) {
  const w = await ensureFocused(ctx);
  let { x, y } = args;
  if (args.space === "screenshot") {
    if (!ctx.lastShot) throw new LiveError("NO_SCREENSHOT", "space \"screenshot\" needs a screenshot taken first.");
    ({ x, y } = shotToClient(ctx.lastShot, x, y));
  }
  const at = clientToScreen(w.client, x, y);
  const r = await ctx.worker.call<{ cursor_x: number; cursor_y: number }>("click", { pid: w.pid, x: at.x, y: at.y, button: args.button ?? "left" });
  return { window_x: x, window_y: y, screen_x: at.x, screen_y: at.y, cursor_x: r.cursor_x, cursor_y: r.cursor_y, button: args.button ?? "left" };
}
