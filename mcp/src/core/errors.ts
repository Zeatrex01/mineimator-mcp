// Typed errors with stable codes. Tools turn them into {error:{code,message,pointer},changed:false}.
import { errorMessages, warningMessages, type ErrorCode, type Params, type WarningCode } from "./messages.ts";

export type { ErrorCode, WarningCode };

export class MineimatorError extends Error {
  readonly code: ErrorCode;
  /** JSON pointer or object id that locates the problem, when there is one. */
  readonly pointer?: string;
  readonly details?: unknown;

  constructor(code: ErrorCode, params: Params = {}, extra: { pointer?: string; details?: unknown } = {}) {
    super(errorMessages[code](params));
    this.name = "MineimatorError";
    this.code = code;
    this.pointer = extra.pointer;
    this.details = extra.details;
  }
}

export interface Warning {
  code: WarningCode;
  message: string;
  pointer?: string;
}

export function warning(code: WarningCode, params: Params = {}, pointer?: string): Warning {
  return { code, message: warningMessages[code](params), ...(pointer ? { pointer } : {}) };
}
