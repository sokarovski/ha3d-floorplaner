// Types for the parts of the Khronos glTF Validator (npm `gltf-validator`, untyped) used by the server
// (template versions) and scripts/build-templates.ts. Only dev builds of the validator are published on npm.
declare module "gltf-validator" {
  export type ValidatorMessage = { code: string; message: string; severity: number; pointer?: string };
  export type ValidatorReport = {
    issues: {
      numErrors: number;
      numWarnings: number;
      numInfos: number;
      numHints: number;
      messages: ValidatorMessage[];
    };
  };
  export type ValidatorOptions = {
    uri?: string;
    format?: "glb" | "gltf";
    maxIssues?: number;
    ignoredIssues?: string[];
    /** Loads a relative resource (buffer or image) referenced by URI; reject to report it missing. */
    externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
  };
  export const validateBytes: (data: Uint8Array, options?: ValidatorOptions) => Promise<ValidatorReport>;
  export const version: () => string;
}
