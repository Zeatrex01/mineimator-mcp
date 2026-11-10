// Window-only, downscaled, on demand. The PNG goes back to the client as base64 and is never written to disk here.
import { fitHeight } from "../coords.ts";
import { ensureFocused, requireWindow, type Ctx } from "../context.ts";

export const MAX_SHOT_HEIGHT = 960;

export async function screenshot(ctx: Ctx, args: { focus?: boolean }) {
  const w = args.focus === false ? await requireWindow(ctx) : await ensureFocused(ctx);
  const size = fitHeight(w.client.w, w.client.h, MAX_SHOT_HEIGHT);
  const r = await ctx.worker.call<{ png_base64: string; width: number; height: number; client_w: number; client_h: number }>(
    "shot",
    { hwnd: w.hwnd, width: size.width, height: size.height },
    30_000,
  );
  ctx.lastShot = { width: r.width, height: r.height, clientW: r.client_w, clientH: r.client_h };
  return {
    data: { width: r.width, height: r.height, window_width: r.client_w, window_height: r.client_h, title: w.title, bytes: Math.round((r.png_base64.length * 3) / 4) },
    image: r.png_base64,
  };
}
