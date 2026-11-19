// Fastify validates requests and response shapes with the one shared Ajv configuration
// (shared/domain/validation/ajv.ts), so `x-homeplan` annotations and formats are understood.
import type { FastifyInstance } from "fastify";
import type { TSchema } from "typebox";
import { getAjv, toIssues } from "../../shared/domain/validation/ajv";

export const registerSchemaCompilers = (app: FastifyInstance): void => {
  app.setValidatorCompiler<TSchema>(({ schema }) => getAjv().compile(schema));

  // Responses are checked against their declared schema before serialization; a mismatch is a server bug.
  app.setSerializerCompiler<TSchema>(({ schema, method, url, httpStatus }) => {
    const validate = getAjv().compile(schema);
    return (data: unknown) => {
      if (!validate(data)) {
        const issues = toIssues(validate.errors);
        throw new Error(
          `Response for ${method} ${url} (${httpStatus ?? "?"}) does not match its schema: ${JSON.stringify(issues.slice(0, 5))}`,
        );
      }
      return JSON.stringify(data);
    };
  });
};
