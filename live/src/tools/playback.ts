// play, pause, go_to_start. Mine-imator has only toggles (Space) and "go to start and play" (Enter), so every
// tool reads the picture before and after (two tiny grayscale samples) and reports what it saw, not what it hoped.
import { compareSamples, type MotionReading } from "../motion.ts";
import { parseKeys } from "../keys.ts";
import { ensureFocused, type Ctx } from "../context.ts";
import { sleep } from "../util.ts";

const PROBE_GAP_MS = 150;
const SETTLE_MS = 200;

async function sample(ctx: Ctx, hwnd: number): Promise<Uint8Array> {
  const r = await ctx.worker.call<{ gray_base64: string }>("sample", { hwnd });
  return Buffer.from(r.gray_base64, "base64");
}

/** Is the picture changing? Two samples PROBE_GAP_MS apart. */
export async function probeMotion(ctx: Ctx, hwnd: number): Promise<MotionReading> {
  const a = await sample(ctx, hwnd);
  await sleep(PROBE_GAP_MS);
  return compareSamples(a, await sample(ctx, hwnd));
}

async function send(ctx: Ctx, pid: number, keys: string, holdMs = 50): Promise<void> {
  const chords = parseKeys(keys);
  await ctx.worker.call("keys", { pid, chords: chords.map((c) => ({ mods: c.mods, key: c.key })), hold_ms: holdMs });
}

const brief = (m: MotionReading) => ({ changed_pixels: m.changed, moving: m.moving });

export async function play(ctx: Ctx) {
  const w = await ensureFocused(ctx);
  const before = await probeMotion(ctx, w.hwnd);
  if (before.moving) return { action: "none", playing: true, note: "The picture is already changing; Space not sent.", before: brief(before) };
  await send(ctx, w.pid, "space");
  await sleep(SETTLE_MS);
  const after = await probeMotion(ctx, w.hwnd);
  return {
    action: "space",
    playing: after.moving,
    verified: after.moving,
    note: after.moving ? "Picture is changing." : "No picture change seen: a still scene, playback already at the end, or the key was not received. Check with screenshot.",
    before: brief(before),
    after: brief(after),
  };
}

export async function pause(ctx: Ctx) {
  const w = await ensureFocused(ctx);
  const before = await probeMotion(ctx, w.hwnd);
  if (!before.moving) return { action: "none", paused: true, note: "No picture change seen; Space not sent (a still scene looks the same playing or paused).", before: brief(before) };
  await send(ctx, w.pid, "space");
  await sleep(SETTLE_MS);
  const after = await probeMotion(ctx, w.hwnd);
  return { action: "space", paused: !after.moving, verified: !after.moving, before: brief(before), after: brief(after) };
}

/**
 * Enter = "go to start and play" (action_tl_play_beginning). Space then pauses within a couple of frames, and holding
 * Left walks the marker back to frame 0 (it clamps at 0, and only moves while paused).
 */
export async function goToStart(ctx: Ctx) {
  const w = await ensureFocused(ctx);
  await send(ctx, w.pid, "enter");
  await sleep(30);
  await send(ctx, w.pid, "space");
  await sleep(SETTLE_MS);
  await send(ctx, w.pid, "left", 600);
  await sleep(SETTLE_MS);
  const after = await probeMotion(ctx, w.hwnd);
  return {
    keys: "enter, space, left (held 600 ms)",
    stopped: !after.moving,
    note: after.moving ? "The picture is still changing: playback did not stop. Check with screenshot." : "Stopped. Frame 0 is expected but not read from the app; check with screenshot.",
    after: brief(after),
  };
}
