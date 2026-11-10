// Mine-imator object IDs: 16 characters of 0-9 and A-Z (observed in real projects).
import { randomInt } from "node:crypto";
import { MineimatorError } from "./errors.ts";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const ID_PATTERN = /^[0-9A-Z]{16}$/;

/** Reserved words that can sit in reference fields instead of an id. */
export const SENTINELS: ReadonlySet<string> = new Set(["root", "null", "none", "default", ""]);

export function newId(taken: Set<string>): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let id = "";
    for (let i = 0; i < 16; i++) id += ALPHABET[randomInt(ALPHABET.length)];
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
  throw new MineimatorError("ID_EXHAUSTED");
}
