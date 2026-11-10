// Writes examples/generic-scene.miproject and data/poses/pose-library.schema.json from their sources in code.
// Run with `npm run build:data`. Existing files are replaced here on purpose: they are generated, not hand-edited.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { poseLibraryJsonSchema } from "../src/core/poseLibrary.ts";
import { buildExampleScene } from "./example-scene.ts";

const root = join(import.meta.dirname, "..");
writeFileSync(join(root, "examples", "generic-scene.miproject"), JSON.stringify(buildExampleScene(), null, "\t") + "\n");
writeFileSync(join(root, "data", "poses", "pose-library.schema.json"), JSON.stringify(poseLibraryJsonSchema(), null, 2) + "\n");
console.log("wrote examples/generic-scene.miproject and data/poses/pose-library.schema.json");
