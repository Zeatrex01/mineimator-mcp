import { test } from "node:test";
import assert from "node:assert/strict";
import { clientToScreen, fitHeight, shotToClient } from "../src/coords.ts";

test("fitHeight keeps the aspect ratio and never enlarges", () => {
  assert.deepEqual(fitHeight(1920, 1080, 960), { width: 1707, height: 960 });
  assert.deepEqual(fitHeight(800, 600, 960), { width: 800, height: 600 });
  assert.deepEqual(fitHeight(1000, 2000, 960), { width: 480, height: 960 });
  assert.throws(() => fitHeight(0, 10, 960));
});

test("client -> screen adds the window origin and rejects points outside", () => {
  const client = { x: 100, y: 50, w: 800, h: 600 };
  assert.deepEqual(clientToScreen(client, 0, 0), { x: 100, y: 50 });
  assert.deepEqual(clientToScreen(client, 799, 599), { x: 899, y: 649 });
  assert.throws(() => clientToScreen(client, 800, 0), /outside/);
  assert.throws(() => clientToScreen(client, -1, 5), /outside/);
});

test("screenshot pixels scale back to window pixels and stay inside the window", () => {
  const shot = { width: 1707, height: 960, clientW: 1920, clientH: 1080 };
  assert.deepEqual(shotToClient(shot, 0, 0), { x: 0, y: 0 });
  assert.deepEqual(shotToClient(shot, 853, 480), { x: 959, y: 540 });
  const last = shotToClient(shot, 1706, 959);
  assert.ok(last.x <= 1919 && last.y <= 1079);
  assert.throws(() => shotToClient(shot, 1707, 0), /outside/);
});
