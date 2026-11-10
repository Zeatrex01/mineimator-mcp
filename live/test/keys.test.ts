import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKeys } from "../src/keys.ts";
import { LiveError } from "../src/errors.ts";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as LiveError).code;
  }
  return "no error";
};

test("letters, digits and named keys map to virtual-key codes", () => {
  assert.equal(parseKeys("a")[0].key, 0x41);
  assert.equal(parseKeys("Z")[0].key, 0x5a);
  assert.equal(parseKeys("0")[0].key, 0x30);
  assert.equal(parseKeys("space")[0].key, 0x20);
  assert.equal(parseKeys("enter")[0].key, 0x0d);
  assert.equal(parseKeys("left")[0].key, 0x25);
  assert.equal(parseKeys("f5")[0].key, 0x74);
  assert.equal(parseKeys("f10")[0].key, 0x79);
});

test("a chord has modifiers first and the key last; case and duplicates are normalised", () => {
  const [c] = parseKeys("Ctrl+Shift+S");
  assert.deepEqual(c.mods, [0x11, 0x10]);
  assert.equal(c.key, 0x53);
  assert.equal(c.label, "ctrl+shift+s");
  assert.deepEqual(parseKeys("ctrl+control+o")[0].mods, [0x11]);
});

test("several chords are split on whitespace, in order", () => {
  assert.deepEqual(parseKeys("ctrl+o  left   left").map((c) => c.label), ["ctrl+o", "left", "left"]);
});

test("unknown keys and modifiers, empty input and too many chords are refused", () => {
  assert.equal(code(() => parseKeys("")), "BAD_KEYS");
  assert.equal(code(() => parseKeys("banana")), "BAD_KEYS");
  assert.equal(code(() => parseKeys("win+e")), "BAD_KEYS");
  assert.equal(code(() => parseKeys("f13")), "BAD_KEYS");
  assert.equal(code(() => parseKeys(Array(17).fill("a").join(" "))), "BAD_KEYS");
});

test("chords that would close the window or open the log are blocked", () => {
  assert.equal(code(() => parseKeys("alt+f4")), "BLOCKED_KEYS");
  assert.equal(code(() => parseKeys("f11")), "BLOCKED_KEYS");
  assert.equal(code(() => parseKeys("f12")), "BLOCKED_KEYS");
  assert.equal(parseKeys("ctrl+f4")[0].key, 0x73); // only alt+f4 is blocked
});
