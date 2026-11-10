// Sections, id format and uniqueness, output size, tempo and the export region.
import { ID_PATTERN } from "../ids.ts";
import { SUPPORTED_FORMAT } from "../format.ts";
import type { Project } from "../project.ts";
import type { Report } from "./report.ts";

export function checkStructure(project: Project, r: Report): void {
  if (project.format !== SUPPORTED_FORMAT) {
    r.warn("FORMAT_VERSION", "/format", `format ${project.format}, these tools are built for ${SUPPORTED_FORMAT}`);
  }
  for (const section of ["project", "render", "background"] as const) {
    const value = project[section];
    if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) {
      r.error("BAD_SECTION", `/${section}`, `"${section}" must be an object`);
    }
  }

  const seen = new Set<string>();
  const collections = [["templates", project.templates], ["timelines", project.timelines], ["resources", project.resources]] as const;
  for (const [name, items] of collections) {
    items.forEach((item, i) => {
      const pointer = `/${name}/${i}/id`;
      if (typeof item.id !== "string" || !ID_PATTERN.test(item.id)) r.error("BAD_ID", pointer, `${item.id}: id is not 16 characters of 0-9 A-Z`);
      if (seen.has(item.id)) r.error("DUPLICATE_ID", pointer, `${item.id}: duplicate id`);
      seen.add(item.id);
    });
  }

  const p = project.project;
  for (const key of ["video_width", "video_height"]) {
    const v = p[key];
    if (v !== undefined && !(typeof v === "number" && Number.isInteger(v) && v > 0)) {
      r.error("INVALID_OUTPUT", `/project/${key}`, `${key} must be a positive whole number`);
    }
  }
  const tempo = p.tempo;
  if (tempo !== undefined && !(typeof tempo === "number" && Number.isFinite(tempo) && tempo > 0)) {
    r.error("INVALID_OUTPUT", "/project/tempo", "tempo must be a positive number");
  }

  const region = (p.timeline as Record<string, unknown> | undefined) ?? {};
  const { region_start: start, region_end: end } = region;
  const unset = (v: unknown) => v === undefined || v === "null";
  const whole = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
  if (!unset(start) && !whole(start)) r.error("INVALID_REGION", "/project/timeline/region_start", "region_start must be \"null\" or a whole frame");
  if (!unset(end) && !whole(end)) r.error("INVALID_REGION", "/project/timeline/region_end", "region_end must be \"null\" or a whole frame");
  if (whole(start) && whole(end) && (start as number) >= (end as number)) {
    r.error("INVALID_REGION", "/project/timeline", "region_start must be before region_end");
  }
}
