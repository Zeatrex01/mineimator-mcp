import { ensureFocused, sizeOf, type Ctx } from "../context.ts";

export async function focus(ctx: Ctx) {
  const w = await ensureFocused(ctx);
  return { foreground: true, method: w.focus_method, title: w.title, ...sizeOf(w), dpi: w.dpi };
}
