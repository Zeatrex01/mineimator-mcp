// Just enough PNG reading to validate a skin: the signature and the size in the IHDR chunk.
import { MineimatorError } from "./errors.ts";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngSize {
  width: number;
  height: number;
}

export function readPngSize(bytes: Buffer, origin = "image"): PngSize {
  const bad = (reason: string) => new MineimatorError("INVALID_PNG", { path: origin, reason });
  if (bytes.length < 33) throw bad("the file is too short");
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw bad("the PNG signature is missing");
  if (bytes.subarray(12, 16).toString("latin1") !== "IHDR") throw bad("the first chunk is not IHDR");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) throw bad("the image has no pixels");
  return { width, height };
}

/** Skins of 64x64 (modern) and 64x32 (legacy) are accepted. */
export function assertSkinSize(size: PngSize): void {
  const ok = size.width === 64 && (size.height === 64 || size.height === 32);
  if (!ok) throw new MineimatorError("UNSUPPORTED_SKIN_SIZE", { width: size.width, height: size.height });
}
