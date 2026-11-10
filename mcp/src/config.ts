// Runtime configuration. Everything comes from environment variables with a portable default;
// no machine-specific path is ever written in the source.
import { resolve } from "node:path";

export interface Config {
  /** Folder of pose-library JSON files. Env MINEIMATOR_POSES; default: the data/poses folder of this package. */
  posesDir: string;
  /** Private pose libraries (gitignored data/local), merged over the shipped ones when the folder exists. Not used when MINEIMATOR_POSES is set. */
  localPosesDir?: string;
  /** When set, save_project may only write below this folder. Env MINEIMATOR_OUTPUT_ROOT; default: unrestricted. */
  outputRoot: string | undefined;
  /**
   * Folder of an installed Mine-imator (the one that contains Data/ and Particles/). Env MINEIMATOR_HOME.
   * Read only: it feeds the built-in library (core/library.ts).
   */
  mineimatorHome: string | undefined;
}

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    posesDir: resolve(env.MINEIMATOR_POSES || resolve(PACKAGE_ROOT, "data", "poses")),
    localPosesDir: env.MINEIMATOR_POSES ? undefined : resolve(PACKAGE_ROOT, "data", "local"),
    outputRoot: env.MINEIMATOR_OUTPUT_ROOT ? resolve(env.MINEIMATOR_OUTPUT_ROOT) : undefined,
    mineimatorHome: env.MINEIMATOR_HOME ? resolve(env.MINEIMATOR_HOME) : undefined,
  };
}
