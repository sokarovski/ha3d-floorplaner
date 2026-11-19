// The single error envelope for every non-2xx API response (spec/architecture/api.md#conventions),
// plus SPA fallback for non-API routes in production.
import type { FastifyInstance, FastifyReply } from "fastify";
import type { SpaIndex } from "./spaIndex";
import type { ApiErrorCode, ValidationIssueValue } from "../../shared/contracts/common";

export type { ApiErrorCode };

const statusByCode: Readonly<Record<ApiErrorCode, number>> = {
  validation: 400,
  badRequest: 400,
  notFound: 404,
  staleRevision: 409,
  referenced: 409,
  nameTaken: 409,
  tooLarge: 413,
  unsupportedMedia: 415,
  unsupportedVersion: 422,
  invalidDocument: 422,
  internal: 500,
  unavailable: 503,
  sourceRevisionChanged: 409,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: ApiErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return statusByCode[this.code];
  }
}

/** A `400 validation` error with JSON Pointer issues. */
export const validationError = (
  issues: readonly ValidationIssueValue[],
  message = "The request is invalid.",
): ApiError => {
  const unique = new Map<string, ValidationIssueValue>();
  for (const issue of issues) unique.set(`${issue.pointer}\n${issue.message}`, issue);
  return new ApiError("validation", message, { errors: [...unique.values()] });
};

export const sendError = (reply: FastifyReply, error: ApiError): FastifyReply =>
  reply.status(error.status).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  });

type AjvIssue = Readonly<{ instancePath?: unknown; message?: unknown; keyword?: unknown; params?: unknown }>;

const isAjvIssueList = (value: unknown): value is readonly AjvIssue[] =>
  Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null);

const issuePointer = (issue: AjvIssue): string => {
  const base = typeof issue.instancePath === "string" ? issue.instancePath : "";
  if (
    issue.keyword === "required" &&
    typeof issue.params === "object" &&
    issue.params !== null &&
    "missingProperty" in issue.params
  ) {
    const missing = issue.params.missingProperty;
    if (typeof missing === "string") return `${base}/${missing.replaceAll("~", "~0").replaceAll("/", "~1")}`;
  }
  if (
    issue.keyword === "additionalProperties" &&
    typeof issue.params === "object" &&
    issue.params !== null &&
    "additionalProperty" in issue.params
  ) {
    const extra = issue.params.additionalProperty;
    if (typeof extra === "string") return `${base}/${extra.replaceAll("~", "~0").replaceAll("/", "~1")}`;
  }
  return base;
};

const statusCodeOf = (error: unknown): number | undefined =>
  typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
    ? error.statusCode
    : undefined;

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message !== "" ? error.message : fallback;

export type ErrorHandlingOptions = Readonly<{ apiPrefix: string; spa: SpaIndex | null }>;

export const registerErrorHandling = (app: FastifyInstance, options: ErrorHandlingOptions): void => {
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ApiError) {
      if (error.status >= 500) request.log.error(error);
      return sendError(reply, error);
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "validation" in error &&
      isAjvIssueList(error.validation)
    ) {
      const context =
        "validationContext" in error && typeof error.validationContext === "string"
          ? error.validationContext
          : "body";
      const issues = new Map<string, ValidationIssueValue>();
      for (const issue of error.validation) {
        const entry = {
          pointer: `/${context}${issuePointer(issue)}`,
          message: typeof issue.message === "string" ? issue.message : "Invalid value",
        };
        issues.set(`${entry.pointer}\n${entry.message}`, entry);
      }
      return sendError(reply, validationError([...issues.values()]));
    }
    const status = statusCodeOf(error);
    if (status === 413) return sendError(reply, new ApiError("tooLarge", "The upload is too large."));
    if (status === 415 || status === 406)
      return sendError(
        reply,
        new ApiError("unsupportedMedia", messageOf(error, "The media type is not supported.")),
      );
    if (status === 404) return sendError(reply, new ApiError("notFound", messageOf(error, "Not found.")));
    if (status !== undefined && status >= 400 && status < 500)
      return sendError(reply, new ApiError("badRequest", messageOf(error, "Bad request.")));
    request.log.error(error);
    return sendError(reply, new ApiError("internal", "An unexpected server error occurred."));
  });

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?", 1)[0] ?? request.url;
    const isApi = path === options.apiPrefix || path.startsWith(`${options.apiPrefix}/`);
    if (isApi || request.method !== "GET" || options.spa === null) {
      return sendError(
        reply,
        new ApiError(
          "notFound",
          isApi || options.spa !== null || request.method !== "GET"
            ? `No route for ${request.method} ${path}`
            : "The client is not built. Run npm run build.",
        ),
      );
    }
    return options.spa(request, reply);
  });
};
