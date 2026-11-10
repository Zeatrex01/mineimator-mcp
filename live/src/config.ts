// Configuration from the environment. Only the Mine-imator folder is configurable.
import { join } from "node:path";

export const DEFAULT_HOME = "C:\\Program Files\\Mine-imator";

export interface LiveConfig {
  home: string;
  exe: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): LiveConfig {
  const home = env.MINEIMATOR_HOME?.trim() || DEFAULT_HOME;
  return { home, exe: join(home, "Mine-imator.exe") };
}
