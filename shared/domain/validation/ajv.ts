// One Ajv configuration shared by browser and server (D13, D18). `x-homeplan` is an annotation keyword.
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { Static, TSchema } from "typebox";

export type ValidationIssue = Readonly<{ pointer: string; message: string }>;

export const createAjv = (): Ajv2020 => {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    keywords: ["x-homeplan"],
    // TypeBox's Optional/Record emit standard keywords; unions of literals are fine under strict mode.
    strictTypes: false,
  });
  addFormats(ajv);
  return ajv;
};

let sharedAjv: Ajv2020 | undefined;

/** The application-wide Ajv instance (lazy). */
export const getAjv = (): Ajv2020 => {
  sharedAjv ??= createAjv();
  return sharedAjv;
};

export const toIssues = (errors: readonly ErrorObject[] | null | undefined): readonly ValidationIssue[] =>
  (errors ?? []).map((error) => ({
    pointer:
      error.keyword === "required" && typeof error.params.missingProperty === "string"
        ? `${error.instancePath}/${error.params.missingProperty}`
        : error.instancePath,
    message: error.message ?? "Invalid value",
  }));

/** Compiles a validator that narrows to the schema's static type. Ajv caches by schema identity. */
export const compileValidator = <S extends TSchema>(schema: S): ValidateFunction<Static<S>> =>
  getAjv().compile<Static<S>>(schema);
