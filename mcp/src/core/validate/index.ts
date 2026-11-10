// Structural checks a project must pass before it is saved. Rules are calibrated so that all real
// projects pass (test/real-projects.test.ts, opt-in via MINEIMATOR_ARCHIVE); each rule group has its own file.
import { checkCameras } from "./cameras.ts";
import { checkKeyframes } from "./keyframes.ts";
import { checkReferences } from "./references.ts";
import { makeReport, type Issue } from "./report.ts";
import { checkRigs } from "./rigs.ts";
import { checkStructure } from "./structure.ts";
import type { Project } from "../project.ts";

export type { Issue, IssueCode } from "./report.ts";

export function validateProject(project: Project): Issue[] {
  const { report, issues } = makeReport();
  checkStructure(project, report);
  checkReferences(project, report);
  checkRigs(project, report);
  checkKeyframes(project, report);
  checkCameras(project, report);
  return issues;
}

export function errorsOf(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.level === "error");
}
