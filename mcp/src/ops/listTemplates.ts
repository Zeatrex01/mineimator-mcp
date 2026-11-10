// list_templates: what can be copied. Looks at the open project and, after new_scene, at the donor it came from.
import { rigIdOf } from "../core/format.ts";
import type { Project, Template } from "../core/project.ts";

export interface TemplateEntry {
  id: string;
  type: string;
  name: string;
  /** Model name and rig id for characters, e.g. "human/wide/steve@1". */
  model: string | null;
  /** Skin file name, when the template points at a skin resource. */
  skin: string | null;
  /** Timelines that use the template and are not body parts: the things you can copy with place_character. */
  source_root_ids: string[];
  origin: "scene" | "donor";
}

function describe(doc: Project, t: Template, origin: "scene" | "donor"): TemplateEntry {
  const skinRef = typeof t.model_tex === "string" ? t.model_tex : undefined;
  const skin = skinRef ? (doc.resources.find((r) => r.id === skinRef)?.filename ?? (skinRef === "default" ? "default" : null)) : null;
  const modelRes = t.type === "model" && typeof t.model === "string" ? doc.resources.find((r) => r.id === t.model)?.filename : undefined;
  return {
    id: t.id,
    type: t.type,
    name: t.name ?? "",
    model: rigIdOf(t) ?? modelRes ?? null,
    skin,
    source_root_ids: doc.timelines.filter((tl) => tl.temp === t.id && tl.type !== "bodypart").map((tl) => tl.id),
    origin,
  };
}

export function listTemplates(project: Project, donor: Project | null, filter: { type?: string } = {}): TemplateEntry[] {
  const entries = [
    ...project.templates.map((t) => describe(project, t, "scene")),
    ...(donor ? donor.templates.map((t) => describe(donor, t, "donor")) : []),
  ];
  return filter.type ? entries.filter((e) => e.type === filter.type) : entries;
}
