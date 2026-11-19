// The one typed HTTP transport. Responses are decoded with the shared Ajv schemas; a TypeScript type is not validation.
import type { Static, TSchema } from "typebox";
import { ErrorEnvelope } from "@shared/contracts/common";
import { compileValidator } from "@shared/domain/validation/ajv";
import { ApiClientError, categoryForStatus } from "./apiError";

export type QueryValue = string | number | undefined;

export type RequestOptions = Readonly<{
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: readonly string[];
  query?: Readonly<Record<string, QueryValue>>;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}>;

export type HttpClient = Readonly<{
  request: <S extends TSchema>(options: RequestOptions, schema: S) => Promise<Static<S>>;
  requestEmpty: (options: RequestOptions) => Promise<void>;
  url: (path: readonly string[], query?: Readonly<Record<string, QueryValue>>) => string;
}>;

const buildUrl = (
  base: string,
  path: readonly string[],
  query?: Readonly<Record<string, QueryValue>>,
): string => {
  // encodeURIComponent leaves "." and ".." intact, and a URL resolves them as dot segments.
  if (path.some((segment) => segment === "." || segment === ".."))
    throw new ApiClientError("validation", 'A request path segment cannot be "." or "..".');
  const encoded = path.map((segment) => encodeURIComponent(segment)).join("/");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {}))
    if (value !== undefined) params.set(key, String(value));
  const search = params.toString();
  return `${base}/${encoded}${search === "" ? "" : `?${search}`}`;
};

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (text === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
};

const toError = async (response: Response): Promise<ApiClientError> => {
  const payload = await readJson(response);
  const validate = compileValidator(ErrorEnvelope);
  if (validate(payload)) {
    return new ApiClientError(categoryForStatus(response.status), payload.error.message, {
      status: response.status,
      code: payload.error.code,
      details: payload.error.details,
    });
  }
  return new ApiClientError(
    categoryForStatus(response.status),
    `The server answered ${String(response.status)}.`,
    { status: response.status },
  );
};

export const createHttpClient = (
  baseUrl: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): HttpClient => {
  const send = async (options: RequestOptions): Promise<Response> => {
    const headers: Record<string, string> = { accept: "application/json" };
    let body: BodyInit | undefined;
    if (options.form !== undefined) body = options.form;
    else if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    try {
      const response = await fetchImpl(buildUrl(baseUrl, options.path, options.query), {
        method: options.method,
        headers,
        body,
        signal: options.signal,
      });
      if (!response.ok) throw await toError(response);
      return response;
    } catch (error: unknown) {
      if (error instanceof ApiClientError) throw error;
      if (error instanceof DOMException && error.name === "AbortError")
        throw new ApiClientError("aborted", "The request was cancelled.");
      throw new ApiClientError("network", "The server could not be reached.");
    }
  };

  return {
    request: async (options, schema) => {
      const response = await send(options);
      const payload = await readJson(response);
      const validate = compileValidator(schema);
      if (!validate(payload))
        throw new ApiClientError("invalidResponse", "The server sent an unexpected response.", {
          status: response.status,
        });
      return payload;
    },
    requestEmpty: async (options) => {
      await send(options);
    },
    url: (path, query) => buildUrl(baseUrl, path, query),
  };
};
