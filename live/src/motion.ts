// "Is the picture changing?" from two small grayscale samples. Pure; the samples come from the worker.
export const PIXEL_THRESHOLD = 16; // gray levels a pixel must change to count
export const MIN_CHANGED_PIXELS = 6; // changed pixels needed to call it motion

export interface MotionReading {
  changed: number;
  total: number;
  moving: boolean;
}

export function compareSamples(a: Uint8Array, b: Uint8Array): MotionReading {
  if (a.length !== b.length || a.length === 0) throw new Error(`Samples differ in size: ${a.length} vs ${b.length}.`);
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) >= PIXEL_THRESHOLD) changed++;
  return { changed, total: a.length, moving: changed >= MIN_CHANGED_PIXELS };
}
