// Shared shape of validator output.
export type IssueCode =
  | "FORMAT_VERSION" | "BAD_SECTION" | "BAD_ID" | "DUPLICATE_ID" | "DANGLING_REFERENCE" | "INVALID_FRAME"
  | "INVALID_TRANSITION" | "INVALID_VALUE" | "UNSUPPORTED_BEND" | "RIG_INCONSISTENT" | "PARENT_CYCLE"
  | "DUPLICATE_SIBLING_INDEX" | "INVALID_OUTPUT" | "INVALID_REGION" | "NO_CAMERA" | "MULTIPLE_CAMERAS" | "CAMERA_GAP";

export interface Issue {
  level: "error" | "warning";
  code: IssueCode;
  /** JSON pointer into the project, e.g. /timelines/3/parent */
  pointer: string;
  message: string;
}

export interface Report {
  error(code: IssueCode, pointer: string, message: string): void;
  warn(code: IssueCode, pointer: string, message: string): void;
}

export function makeReport(): { report: Report; issues: Issue[] } {
  const issues: Issue[] = [];
  return {
    issues,
    report: {
      error: (code, pointer, message) => issues.push({ level: "error", code, pointer, message }),
      warn: (code, pointer, message) => issues.push({ level: "warning", code, pointer, message }),
    },
  };
}
