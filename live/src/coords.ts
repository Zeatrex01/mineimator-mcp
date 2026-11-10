// Coordinate maths for clicks and screenshots. Pure.
import { LiveError } from "./errors.ts";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShotGeometry {
  /** Size of the returned (downscaled) image. */
  width: number;
  height: number;
  /** Size of the window's client area in screen pixels. */
  clientW: number;
  clientH: number;
}

/** Largest size with height <= maxH and the same aspect ratio. Never enlarges. */
export function fitHeight(w: number, h: number, maxH: number): { width: number; height: number } {
  if (w <= 0 || h <= 0 || maxH <= 0) throw new LiveError("BAD_SIZE", `Cannot fit ${w}x${h} into height ${maxH}.`);
  if (h <= maxH) return { width: w, height: h };
  return { width: Math.max(1, Math.round((w * maxH) / h)), height: maxH };
}

/** A point inside the client area (client pixels) -> screen pixels. */
export function clientToScreen(client: Rect, x: number, y: number): { x: number; y: number } {
  if (x < 0 || y < 0 || x >= client.w || y >= client.h) {
    throw new LiveError("OUT_OF_WINDOW", `Point (${x}, ${y}) is outside the ${client.w}x${client.h} window area.`);
  }
  return { x: client.x + x, y: client.y + y };
}

/** A point in the downscaled screenshot -> client pixels of the real window. */
export function shotToClient(shot: ShotGeometry, x: number, y: number): { x: number; y: number } {
  if (x < 0 || y < 0 || x >= shot.width || y >= shot.height) {
    throw new LiveError("OUT_OF_WINDOW", `Point (${x}, ${y}) is outside the ${shot.width}x${shot.height} screenshot.`);
  }
  return {
    x: Math.min(shot.clientW - 1, Math.round((x * shot.clientW) / shot.width)),
    y: Math.min(shot.clientH - 1, Math.round((y * shot.clientH) / shot.height)),
  };
}
