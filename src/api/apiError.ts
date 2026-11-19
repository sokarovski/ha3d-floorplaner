// Normalized client error categories (spec/architecture/state-and-data.md#client-and-api-boundary).
import Type from "typebox";
import { ValidationIssue } from "@shared/contracts/common";
import type { ApiErrorCode } from "@shared/contracts/common";
import { compileValidator } from "@shared/domain/validation/ajv";

const IssueList = Type.Array(ValidationIssue);

export type ApiErrorCategory =
  | "network"
  | "aborted"
  | "notFound"
  | "validation"
  | "conflict"
  | "unsupportedVersion"
  | "tooLarge"
  | "server"
  | "invalidResponse";

export class ApiClientError extends Error {
  readonly category: ApiErrorCategory;
  readonly status: number | undefined;
  readonly code: ApiErrorCode | undefined;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(
    category: ApiErrorCategory,
    message: string,
    options: { status?: number; code?: ApiErrorCode; details?: Readonly<Record<string, unknown>> } = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.category = category;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }

  /** Field errors from a 400 validation response, keyed by JSON Pointer with the request section stripped (/body). */
  fieldErrors(section = "/body"): Readonly<Record<string, string>> {
    const errors = this.details?.errors;
    const validate = compileValidator(IssueList);
    if (!validate(errors)) return {};
    const result: Record<string, string> = {};
    for (const entry of errors) {
      const pointer = entry.pointer.startsWith(section) ? entry.pointer.slice(section.length) : entry.pointer;
      if (!(pointer in result)) result[pointer] = entry.message;
    }
    return result;
  }

  /** The server's current revision on a stale-revision conflict. */
  currentRevision(): number | undefined {
    const value = this.details?.currentRevision;
    return typeof value === "number" ? value : undefined;
  }
}

export const categoryForStatus = (status: number): ApiErrorCategory =>
  status === 404
    ? "notFound"
    : status === 409
      ? "conflict"
      : status === 413
        ? "tooLarge"
        : status === 422
          ? "unsupportedVersion"
          : status >= 500
            ? "server"
            : "validation";

export const isAbort = (error: unknown): boolean =>
  error instanceof ApiClientError && error.category === "aborted";
