// Key names -> Windows virtual-key codes. Pure: no OS calls. "ctrl+shift+s left" = two chords.
import { LiveError } from "./errors.ts";

export interface Chord {
  /** Modifier virtual-key codes, pressed before the key and released after it. */
  mods: number[];
  key: number;
  /** Normalised text such as "ctrl+shift+s". */
  label: string;
}

const MODIFIERS: Record<string, number> = { ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12 };

const NAMED: Record<string, number> = {
  space: 0x20, enter: 0x0d, return: 0x0d, tab: 0x09, esc: 0x1b, escape: 0x1b, backspace: 0x08, delete: 0x2e, del: 0x2e,
  left: 0x25, up: 0x26, right: 0x27, down: 0x28, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
};

export const MAX_CHORDS = 16;

function keyCode(name: string): number | undefined {
  if (name in NAMED) return NAMED[name];
  if (/^[a-z]$/.test(name)) return name.charCodeAt(0) - 32; // 'a' -> 0x41
  if (/^[0-9]$/.test(name)) return name.charCodeAt(0); // '0' -> 0x30
  const f = /^f([1-9]|1[0-2])$/.exec(name);
  if (f) return 0x70 + Number(f[1]) - 1;
  return undefined;
}

/** Chords this server never sends: they close the user's window or open files outside the task. */
function blockedReason(mods: number[], key: number): string | undefined {
  if (mods.includes(0x12) && key === 0x73) return "alt+f4 would close the user's Mine-imator window";
  if (key === 0x7a) return "f11 opens Mine-imator's log file";
  if (key === 0x7b) return "f12 toggles Mine-imator's debug overlay";
  return undefined;
}

export function parseKeys(input: string): Chord[] {
  const parts = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new LiveError("BAD_KEYS", "keys is empty. Example: \"ctrl+o\" or \"left left space\".");
  if (parts.length > MAX_CHORDS) throw new LiveError("BAD_KEYS", `At most ${MAX_CHORDS} chords per call, got ${parts.length}.`);
  return parts.map((part) => {
    const tokens = part.split("+");
    const keyName = tokens.pop() as string;
    const key = keyCode(keyName);
    if (key === undefined) {
      throw new LiveError("BAD_KEYS", `Unknown key "${keyName}" in "${part}". Known: a-z, 0-9, f1-f12, ${Object.keys(NAMED).join(", ")}; modifiers ctrl, shift, alt.`);
    }
    const mods: number[] = [];
    for (const t of tokens) {
      const m = MODIFIERS[t];
      if (m === undefined) throw new LiveError("BAD_KEYS", `Unknown modifier "${t}" in "${part}". Use ctrl, shift or alt.`);
      if (!mods.includes(m)) mods.push(m);
    }
    const reason = blockedReason(mods, key);
    if (reason) throw new LiveError("BLOCKED_KEYS", `"${part}" is refused: ${reason}.`);
    return { mods, key, label: part };
  });
}
