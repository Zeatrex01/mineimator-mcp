// list_timelines: inspect the hierarchy. Optionally restricted to one root and everything below it, or to one type.
import { subtreeOf, type Project } from "../core/project.ts";

export interface TimelineEntry {
  id: string;
  type: string;
  name: string;
  parent: string | null;
  temp: string | null;
  part_of: string | null;
  model_part_name: string | null;
  keyframes: number;
}

export function listTimelines(project: Project, filter: { rootId?: string; type?: string } = {}): TimelineEntry[] {
  const source = filter.rootId ? subtreeOf(project, filter.rootId) : project.timelines;
  return source
    .filter((t) => !filter.type || t.type === filter.type)
    .map((t) => ({
      id: t.id,
      type: t.type,
      name: t.name ?? "",
      parent: t.parent ?? null,
      temp: t.temp ?? null,
      part_of: t.part_of ?? null,
      model_part_name: t.model_part_name ?? null,
      keyframes: Object.keys(t.keyframes ?? {}).length,
    }));
}
