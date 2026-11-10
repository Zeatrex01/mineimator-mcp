// set_skin: give one character its own skin. The PNG has already been read and measured by the caller (ops do no I/O);
// the file itself is copied next to the project when it is saved.
import { basename } from "node:path";
import { MineimatorError, warning, type Warning } from "../core/errors.ts";
import { assertSkinSize, type PngSize } from "../core/png.ts";
import { allIds, findResource, findTemplate, requireTimeline, subtreeOf, type Project, type Resource } from "../core/project.ts";
import { newId } from "../core/ids.ts";

export interface SetSkinArgs {
  rootId: string;
  /** Absolute path of the PNG on this machine. */
  sourcePath: string;
  size: PngSize;
}

/** Files staged by set_skin: project-relative filename -> absolute source path. */
export type StagedAssets = Map<string, string>;

export function setSkin(project: Project, staged: StagedAssets, args: SetSkinArgs) {
  assertSkinSize(args.size);
  const root = requireTimeline(project, args.rootId);
  if (root.type !== "char") throw new MineimatorError("NOT_CHARACTER", { id: root.id, type: root.type });
  const rig = subtreeOf(project, root.id).filter((t) => t.id === root.id || t.part_of === root.id);

  // One resource per distinct file. A filename already used by a different file gets a numeric suffix.
  let filename = basename(args.sourcePath);
  const sameFile = (r: Resource) => r.filename === filename && staged.get(filename) === args.sourcePath;
  let resource = project.resources.find((r) => r.type === "skin" && sameFile(r));
  if (!resource) {
    const taken = new Set(project.resources.map((r) => r.filename));
    const dot = filename.lastIndexOf(".");
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const ext = dot > 0 ? filename.slice(dot) : "";
    for (let n = 2; taken.has(filename) || (staged.has(filename) && staged.get(filename) !== args.sourcePath); n++) filename = `${stem}-${n}${ext}`;
    resource = { id: newId(allIds(project)), type: "skin", filename, player_skin: true, material_format: 2 };
    project.resources.push(resource);
    staged.set(filename, args.sourcePath);
  }

  // The skin lives on the template. If other characters share it, this rig gets its own copy first.
  const templateId = root.temp!;
  let template = findTemplate(project, templateId);
  if (!template) throw new MineimatorError("ID_NOT_FOUND", { kind: "template", id: templateId });
  const rigIds = new Set(rig.map((t) => t.id));
  const sharedElsewhere = project.timelines.some((t) => t.temp === templateId && !rigIds.has(t.id));
  if (sharedElsewhere) {
    template = { ...structuredClone(template), id: newId(allIds(project)) };
    project.templates.push(template);
    for (const t of rig) if (t.temp === templateId) t.temp = template.id;
  }
  template.model_tex = resource.id;

  const warnings: Warning[] = [];
  for (const key of ["model_tex_material", "model_tex_normal"] as const) {
    const v = template[key];
    if (typeof v === "string" && v !== "default" && v !== "null" && findResource(project, v)) {
      warnings.push(warning("SKIN_MASKED", { reason: `The template sets ${key}.` }, `/templates/${template.id}/${key}`));
    }
  }
  for (const t of rig) {
    const inherits = (t.inherit as { texture?: boolean } | undefined)?.texture;
    const overrides = [t.default_values, ...Object.values(t.keyframes ?? {})].some((v) => v && "TEXTURE_OBJ" in v);
    if (inherits === false && overrides) {
      warnings.push(warning("SKIN_MASKED", { reason: `${t.model_part_name ?? "The character"} has its own texture keys.` }, `/timelines/${t.id}`));
    }
  }
  return { resource_id: resource.id, template_id: template.id, template_cloned: sharedElsewhere, asset_plan: { filename: resource.filename!, source: args.sourcePath }, warnings };
}
