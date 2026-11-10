// place_blocks: build a structure from real Minecraft blocks on a block grid, so sets are made of library blocks, not shapes.
// Grid: cell [i, j, k] is the block whose MINIMUM corner is origin + 16 * [i, j, k] (origin default [0, 0, 0]), like Minecraft block
// coordinates. Mine-imator centres a block on its position horizontally with its bottom at the position's Z (seen on screen,
// README "Placement"), so the timeline is put at cell centre-bottom: origin + 16 * [i + 0.5, j + 0.5, k].
// Each entry is a single block, a line or a box (solid, or hollow = only its outer shell). Later entries overwrite earlier ones in
// the same cell; block "air" removes the cell (carve a doorway out of a wall). One template is shared by every cell of the same
// block and state, one timeline per cell.
import { MineimatorError } from "../core/errors.ts";
import type { LibraryData } from "../core/library.ts";
import { requireTimeline, type Project, type Template } from "../core/project.ts";
import { attachTo, newTimeline } from "../core/timelineDefaults.ts";
import { BLOCK_UNITS, blockTemplate } from "./placeProp.ts";

type Cell = readonly [number, number, number];

export interface BlockEntry {
  /** single: `from` only. line: `from` to `to` along one axis. box: the cuboid between `from` and `to` (inclusive). */
  kind: "single" | "line" | "box";
  block: string;
  state?: Record<string, string>;
  from: Cell;
  to?: Cell;
  /** box only: only the outer shell. */
  hollow?: boolean;
}

export interface PlaceBlocksArgs {
  entries: readonly BlockEntry[];
  /** Scene position of the minimum corner of cell [0, 0, 0] (default [0, 0, 0]). */
  origin?: Cell;
  /** Attach every block under this timeline. */
  parent?: string;
  /** Prefix of the timeline names (default "block"). */
  name?: string;
}

export const MAX_BLOCKS = 4000;
const invalid = (channel: string, reason: string) => new MineimatorError("INVALID_VALUE", { channel, reason });

function checkCell(channel: string, c: Cell | undefined): asserts c is Cell {
  if (!c || c.length !== 3 || !c.every(Number.isInteger)) throw invalid(channel, "three whole numbers [i, j, k] (block cells)");
}

/** The cells an entry covers. */
export function cellsOf(entry: BlockEntry): Cell[] {
  checkCell("from", entry.from);
  if (entry.kind === "single") return [entry.from];
  checkCell("to", entry.to);
  const [a, b] = [entry.from, entry.to];
  const lo = [0, 1, 2].map((n) => Math.min(a[n], b[n]));
  const hi = [0, 1, 2].map((n) => Math.max(a[n], b[n]));
  if (entry.kind === "line" && [0, 1, 2].filter((n) => lo[n] !== hi[n]).length > 1) throw invalid("to", "a line runs along one axis: from and to may differ in one coordinate only");
  const size = [0, 1, 2].map((n) => hi[n] - lo[n] + 1);
  if (size[0] * size[1] * size[2] > MAX_BLOCKS) throw invalid("to", `more than ${MAX_BLOCKS} blocks in one entry`);
  const cells: Cell[] = [];
  for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
    const edge = i === lo[0] || i === hi[0] || j === lo[1] || j === hi[1] || k === lo[2] || k === hi[2];
    if (entry.kind === "box" && entry.hollow && !edge) continue;
    cells.push([i, j, k]);
  }
  return cells;
}

/** The scene position of a cell's timeline (centre-bottom). */
export function cellPosition(cell: Cell, origin: Cell = [0, 0, 0]): [number, number, number] {
  return [origin[0] + BLOCK_UNITS * (cell[0] + 0.5), origin[1] + BLOCK_UNITS * (cell[1] + 0.5), origin[2] + BLOCK_UNITS * cell[2]];
}

export function placeBlocks(project: Project, library: LibraryData | null, args: PlaceBlocksArgs) {
  if (!library) throw new MineimatorError("LIBRARY_NOT_CONFIGURED");
  if (args.entries.length === 0) throw invalid("entries", "at least one entry");
  const origin = args.origin ?? [0, 0, 0];
  if (origin.length !== 3 || !origin.every(Number.isFinite)) throw invalid("origin", "three finite numbers [X, Y, Z]");
  if (args.parent !== undefined) requireTimeline(project, args.parent);

  // 1. cells, last entry wins
  const grid = new Map<string, { cell: Cell; entry: BlockEntry }>();
  for (const entry of args.entries) {
    if (entry.kind !== "single" && entry.kind !== "line" && entry.kind !== "box") throw invalid("kind", "single, line or box");
    for (const cell of cellsOf(entry)) grid.set(cell.join(","), { cell, entry });
    if (grid.size > MAX_BLOCKS) throw invalid("entries", `more than ${MAX_BLOCKS} blocks in total`);
  }

  // 2. one template per block + state (validated by the same code as place_prop)
  const templates = new Map<string, Template>();
  const templateFor = (entry: BlockEntry): Template => {
    const key = `${entry.block}|${JSON.stringify(Object.entries(entry.state ?? {}).sort())}`;
    let template = templates.get(key);
    if (!template) {
      template = blockTemplate(project, library, entry.block, entry.state);
      project.templates.push(template);
      templates.set(key, template);
    }
    return template;
  };

  // 3. one timeline per cell, in x, y, z order so the result is the same every time
  const prefix = args.name ?? "block";
  const placed: Array<{ id: string; cell: Cell; block: string }> = [];
  const ordered = [...grid.values()].sort((p, q) => p.cell[0] - q.cell[0] || p.cell[1] - q.cell[1] || p.cell[2] - q.cell[2]);
  for (const { cell, entry } of ordered) {
    if (entry.block === "air") continue;
    const template = templateFor(entry);
    const timeline = newTimeline(project, "block", { name: `${prefix}_${cell.join("_")}`, temp: template.id });
    const [x, y, z] = cellPosition(cell, origin);
    timeline.default_values = { POS_X: x, POS_Y: y, POS_Z: z };
    project.timelines.push(timeline);
    attachTo(project, timeline, args.parent);
    placed.push({ id: timeline.id, cell, block: entry.block });
  }
  const bounds = placed.length === 0 ? null : {
    min: [0, 1, 2].map((n) => Math.min(...placed.map((p) => p.cell[n]))),
    max: [0, 1, 2].map((n) => Math.max(...placed.map((p) => p.cell[n]))),
  };
  return { placed: placed.length, templates: templates.size, bounds, root_ids: placed.map((p) => p.id) };
}
