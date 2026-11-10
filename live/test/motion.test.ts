import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSamples, MIN_CHANGED_PIXELS, PIXEL_THRESHOLD } from "../src/motion.ts";

test("identical samples are not motion", () => {
  const a = new Uint8Array(100).fill(80);
  assert.deepEqual(compareSamples(a, a.slice()), { changed: 0, total: 100, moving: false });
});

test("small noise under the pixel threshold is ignored", () => {
  const a = new Uint8Array(100).fill(80);
  const b = a.map((v) => v + PIXEL_THRESHOLD - 1);
  assert.equal(compareSamples(a, b).moving, false);
});

test("enough changed pixels count as motion, one fewer does not", () => {
  const a = new Uint8Array(100).fill(80);
  const b = a.slice();
  for (let i = 0; i < MIN_CHANGED_PIXELS - 1; i++) b[i] = 200;
  assert.equal(compareSamples(a, b).moving, false);
  b[MIN_CHANGED_PIXELS - 1] = 200;
  assert.deepEqual(compareSamples(a, b), { changed: MIN_CHANGED_PIXELS, total: 100, moving: true });
});

test("samples of different sizes are an error", () => {
  assert.throws(() => compareSamples(new Uint8Array(3), new Uint8Array(4)), /differ/);
});
