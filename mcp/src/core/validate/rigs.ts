// Hierarchy rules: parents form a tree, siblings have distinct order indexes, and a character's parts agree
// with the character that lists them.
import type { Project } from "../project.ts";
import type { Report } from "./report.ts";

export function checkRigs(project: Project, r: Report): void {
  const byId = new Map(project.timelines.map((t) => [t.id, t]));

  // Parent cycles
  project.timelines.forEach((t, i) => {
    const seen = new Set<string>([t.id]);
    let current = t.parent !== undefined ? byId.get(t.parent) : undefined;
    while (current) {
      if (seen.has(current.id)) {
        r.error("PARENT_CYCLE", `/timelines/${i}/parent`, `${t.id} is its own ancestor`);
        return;
      }
      seen.add(current.id);
      current = current.parent !== undefined ? byId.get(current.parent) : undefined;
    }
  });

  // Sibling order indexes
  const siblings = new Map<string, Map<number, string>>();
  project.timelines.forEach((t, i) => {
    if (t.parent === undefined || typeof t.parent_tree_index !== "number") return;
    const group = siblings.get(t.parent) ?? new Map<number, string>();
    siblings.set(t.parent, group);
    if (group.has(t.parent_tree_index)) {
      r.error("DUPLICATE_SIBLING_INDEX", `/timelines/${i}/parent_tree_index`, `${t.id} shares index ${t.parent_tree_index} with ${group.get(t.parent_tree_index)} under ${t.parent}`);
    }
    group.set(t.parent_tree_index, t.id);
  });

  // Character parts: both directions agree, and a part name appears once per character
  project.timelines.forEach((root, i) => {
    if (!Array.isArray(root.parts)) return;
    const listed = new Set(root.parts);
    root.parts.forEach((id, j) => {
      const part = byId.get(id);
      if (part && part.part_of !== root.id) {
        r.error("RIG_INCONSISTENT", `/timelines/${i}/parts/${j}`, `${id} is listed as a part of ${root.id} but part_of says ${part.part_of}`);
      }
    });
    const names = new Set<string>();
    project.timelines.forEach((part, k) => {
      if (part.part_of !== root.id) return;
      if (!listed.has(part.id)) r.error("RIG_INCONSISTENT", `/timelines/${k}/part_of`, `${part.id} says it belongs to ${root.id} but is not in its parts list`);
      if (part.model_part_name !== undefined) {
        if (names.has(part.model_part_name)) r.error("RIG_INCONSISTENT", `/timelines/${k}/model_part_name`, `${root.id} has two parts named ${part.model_part_name}`);
        names.add(part.model_part_name);
      }
    });
  });
}
