// A minimal read-only zip reader (stored and deflate entries), enough to read the model files that ship inside the
// installed Mine-imator's Minecraft asset zip. No writing, no zip64, no encryption.
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export interface ZipIndex {
  has(name: string): boolean;
  names(): string[];
  read(name: string): Buffer;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function openZip(path: string): ZipIndex {
  const data = readFileSync(path);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 65535); i--) {
    if (data.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${path}: not a zip file (no end-of-central-directory record)`);
  const count = data.readUInt16LE(eocd + 10);
  let pos = data.readUInt32LE(eocd + 16);

  const entries = new Map<string, { method: number; size: number; offset: number }>();
  for (let n = 0; n < count; n++) {
    if (data.readUInt32LE(pos) !== CENTRAL) throw new Error(`${path}: damaged central directory`);
    const method = data.readUInt16LE(pos + 10);
    const size = data.readUInt32LE(pos + 20);
    const nameLength = data.readUInt16LE(pos + 28);
    const extraLength = data.readUInt16LE(pos + 30);
    const commentLength = data.readUInt16LE(pos + 32);
    const offset = data.readUInt32LE(pos + 42);
    entries.set(data.toString("utf8", pos + 46, pos + 46 + nameLength), { method, size, offset });
    pos += 46 + nameLength + extraLength + commentLength;
  }

  return {
    has: (name) => entries.has(name),
    names: () => [...entries.keys()],
    read(name) {
      const entry = entries.get(name);
      if (!entry) throw new Error(`${path}: no entry "${name}"`);
      if (data.readUInt32LE(entry.offset) !== LOCAL) throw new Error(`${path}: damaged entry "${name}"`);
      const start = entry.offset + 30 + data.readUInt16LE(entry.offset + 26) + data.readUInt16LE(entry.offset + 28);
      const packed = data.subarray(start, start + entry.size);
      if (entry.method === 0) return Buffer.from(packed);
      if (entry.method === 8) return inflateRawSync(packed);
      throw new Error(`${path}: entry "${name}" uses unsupported compression ${entry.method}`);
    },
  };
}
