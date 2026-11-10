// Shared test helpers: temp folders, a generated PNG, and the generic example scene.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { loadConfig } from "../src/config.ts";
import { loadPoseLibraries } from "../src/core/poseLibrary.ts";
import type { Project } from "../src/core/project.ts";
import { buildExampleScene, EXAMPLE_IDS } from "../scripts/example-scene.ts";

export { buildExampleScene, EXAMPLE_IDS };

export function tempDir(prefix = "mi-test-"): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A valid solid-colour PNG of the given size. */
export function makePng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const config = () => loadConfig({});
export const libraries = () => loadPoseLibraries(config().posesDir);
export const example = (): Project => buildExampleScene();

// ---- a tiny fake Mine-imator install ---------------------------------------------------------------------------

/** A zip with stored (uncompressed) entries. */
function storedZip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text, "utf8");
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

const part = (name: string, children: unknown[] = [], extra: Record<string, unknown> = {}) => ({ name, position: [0, 0, 0], shapes: [], ...extra, ...(children.length ? { parts: children } : {}) });

/** A made-up install: one mob "hen" (a state "age" swaps its model file and hides the comb), blocks, items, two particle presets. */
export function makeFakeHome(dir: string): string {
  const mc = join(dir, "Data", "Minecraft");
  mkdirSync(mc, { recursive: true });
  mkdirSync(join(dir, "Particles"), { recursive: true });
  writeFileSync(join(dir, "Data", "settings.midata"), JSON.stringify({ assets: { version: "9.9" } }));
  writeFileSync(join(mc, "9.9.midata"), JSON.stringify({
    version: "9.9", format: 9,
    characters: [
      { name: "hen", version: 3, file: "hen.mimodel", texture: "entity/hen", states: { age: [{ value: "adult" }, { value: "chick", file: "chick.mimodel", hide: ["comb"] }] }, default_state: "age=adult" },
      { name: "human", version: 1, states: { type: [{ value: "wide", file: "hen.mimodel" }] }, default_state: "type=wide" },
    ],
    special_blocks: [{ name: "crate", states: { variant: [{ value: "normal", file: "crate.mimodel" }] }, default_state: "variant=normal" }],
    blocks: [
      { name: "planks", states: { variant: [{ value: "oak" }, { value: "birch" }] }, default_state: "variant=oak" },
      { name: "stone", states: { variant: [{ value: "stone" }] }, default_state: "variant=stone" },
      { name: "cake", states: { bites: ["0", "1", "2"] }, default_state: "bites=0" },
    ],
    item_textures: ["item/apple", "item/bread", "item/cooked_beef"],
    particles: [{ name: "generic", texture: "particle/generic" }, { name: "heart", texture: "particle/heart" }, { name: "glitter", texture: "particle/glitter", frames: 8 }],
  }));
  writeFileSync(join(mc, "9.9.zip"), storedZip({
    "assets/minecraft/models/character/hen.mimodel": JSON.stringify({
      name: "hen", texture: "entity/hen", texture_size: [64, 32],
      parts: [
        part("body", [part("head", [part("comb")]), part("right_wing", [], { bend: { part: "back", axis: "y" } }), part("left_wing", [], { depth: 2, backfaces: true })]),
        part("right_leg"), part("left_leg"),
      ],
    }),
    "assets/minecraft/models/character/chick.mimodel": JSON.stringify({
      name: "chick", texture: "entity/hen", texture_size: [64, 32],
      parts: [part("body", [part("head", [part("comb")])]), part("leg")],
    }),
    "assets/minecraft/models/special_block/crate.mimodel": JSON.stringify({ name: "crate", texture: "entity/crate", texture_size: [64, 64], parts: [part("lid"), part("base")] }),
  }));
  const preset = (spawnConstant: boolean, types: unknown[], templates: unknown[] = []) => ({
    format: 34, created_in: "test",
    particles: {
      spawn_constant: spawnConstant, spawn_amount: spawnConstant ? 600 : 40, spawn_region_use: false, bounding_box_type: "none",
      destroy_at_time: true, destroy_at_time_seconds: 2, types,
    },
    templates, timelines: [], resources: [],
  });
  const type = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id, name, temp_type: "template", sprite_tex: "default", sprite_template_tex: "default", sprite_template: "generic", spawn_rate: 1, ...extra,
  });
  writeFileSync(join(dir, "Particles", "Puff.miparticles"), JSON.stringify(preset(true, [type("PUFFPUFFPUFFPUFF", "puff")])));
  writeFileSync(join(dir, "Particles", "Pop.miparticles"), JSON.stringify(preset(false, [type("POPPOPPOPPOPPOPP", "pop", { spawn_rate: 0.5 }), type("CAKECAKECAKECAKE", "crumb", { temp_type: "templateobj", temp: "CRUMBCRUMBCRUMBC" })], [
    { id: "CRUMBCRUMBCRUMBC", type: "block", name: "", block: { name: "cake", state: { bites: "0" }, tex: "default", tex_material: "default", tex_normal: "default", randomize: true, repeat_enable: false, repeat: [1, 1, 1] } },
  ])));
  return dir;
}
