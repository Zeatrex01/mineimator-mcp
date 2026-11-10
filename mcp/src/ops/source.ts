// Find where an object to copy lives: in the project being edited, or in the donor snapshot kept by new_scene.
import { MineimatorError } from "../core/errors.ts";
import { findTimeline, type Project, type Timeline } from "../core/project.ts";

export function locateSource(project: Project, donor: Project | null, id: string): { doc: Project; timeline: Timeline; origin: "scene" | "donor" } {
  const here = findTimeline(project, id);
  if (here) return { doc: project, timeline: here, origin: "scene" };
  const there = donor ? findTimeline(donor, id) : undefined;
  if (there && donor) return { doc: donor, timeline: there, origin: "donor" };
  throw new MineimatorError("ID_NOT_FOUND", { kind: "timeline", id });
}
