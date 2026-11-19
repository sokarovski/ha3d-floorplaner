import Type from "typebox";
import {
  SaveTemplateVersionBody,
  TemplateDraftResponse,
  TemplateImportOptions,
  TemplateVersion,
} from "@shared/contracts/templates";
import { IdString } from "@shared/contracts/common";
import { maxModelBytes } from "@shared/domain/schemas/forms/modelForms";
import { AgentError } from "./automationTypes";
import type { AutomationContext } from "./automationTypes";
import { defineTool } from "./toolDefinition";
import { resourceCall } from "./bridgeCore";

const maxEncodedModelLength = 4 * Math.ceil(maxModelBytes / 3);

/** Decode a JSON-compatible upload; resource clients remain the only transport boundary. */
const modelFile = (name: string, base64: string, format: "gltf" | "stl"): File => {
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (format === "gltf" ? extension !== "glb" && extension !== "gltf" : extension !== "stl")
    throw new AgentError(
      "INVALID_INPUT",
      "fileName must end in .glb/.gltf for gltf format, or .stl for stl format.",
    );
  if (base64.length % 4 !== 0)
    throw new AgentError("INVALID_INPUT", "dataBase64 must use standard padded base64.");
  let decoded: string;
  try {
    decoded = atob(base64);
  } catch {
    throw new AgentError("INVALID_INPUT", "dataBase64 is not valid base64.");
  }
  if (decoded.length === 0 || decoded.length > maxModelBytes)
    throw new AgentError("INVALID_INPUT", "The decoded model must be nonempty and at most 100 MiB.");
  if (btoa(decoded) !== base64)
    throw new AgentError(
      "INVALID_INPUT",
      "dataBase64 must use canonical padded base64 without whitespace or a data-URL prefix.",
    );
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
  const type =
    extension === "glb" ? "model/gltf-binary" : extension === "gltf" ? "model/gltf+json" : "model/stl";
  return new File([bytes], name, { type });
};

const templateCall = async <T>(run: () => Promise<T>): Promise<T> =>
  resourceCall(
    run,
    "The template request failed.",
    "Inspect list_templates/get_template_draft before retrying an uncertain server result.",
  );

export const templateTools = (context: AutomationContext) => [
  defineTool({
    name: "import_template",
    description:
      "Imports a generated GLB/self-contained glTF or STL into this house through Homeplan's client. Returns templateId and draft; save_template_version is required before placement. Asset creation is outside model Undo. Read docs.read('templates') for encoding and the complete workflow.",
    effect: "resource",
    input: Type.Object(
      {
        fileName: Type.String({
          minLength: 1,
          maxLength: 255,
          pattern: "^[^/\\\\\\u0000-\\u001f]+$",
          description: "A filename, without directory components, ending in .glb, .gltf or .stl.",
        }),
        dataBase64: Type.String({
          minLength: 4,
          maxLength: maxEncodedModelLength,
          pattern: "^[A-Za-z0-9+/]*={0,2}$",
          description:
            "Canonical padded base64 of the file bytes, no data-URL prefix. Decoded limit: 100 MiB.",
        }),
        options: TemplateImportOptions,
      },
      { additionalProperties: false },
    ),
    output: TemplateDraftResponse,
    examples: [
      {
        input: {
          fileName: "figure.gltf",
          dataBase64: "eyJhc3NldCI6eyJ2ZXJzaW9uIjoiMi4wIn19",
          options: { format: "gltf" },
        },
      },
    ],
    run: (input) => {
      const file = modelFile(input.fileName, input.dataBase64, input.options.format);
      return {
        data: undefined,
        action: async (ensureOpen) => {
          const result = await templateCall(() =>
            context.templates.importModel(context.session.houseId, file, input.options),
          );
          ensureOpen();
          context.onTemplatesChanged?.();
          return result;
        },
      };
    },
  }),
  defineTool({
    name: "get_template_draft",
    description:
      "Reads a house template's authoring draft, metadata, node rules, normalization transform, bounds and saved versions. Use the returned prefilledMetadata/rootTransform/nodeRules when saving a version. Built-in templates have no editable house draft.",
    effect: "read",
    input: Type.Object({ templateId: IdString }, { additionalProperties: false }),
    output: TemplateDraftResponse,
    examples: [{ input: { templateId: "t_example1" } }],
    run: async ({ templateId }) => ({
      data: await templateCall(() => context.templates.draft(context.session.houseId, templateId)),
    }),
  }),
  defineTool({
    name: "save_template_version",
    description:
      "Saves a new house-template version using the same metadata/glTF validation as Object Editor. Returns templateId and version for place_object/place_opening. Existing instances keep their pinned version. Asset versions are outside model Undo; use save afterward for a Git revision.",
    effect: "resource",
    input: Type.Object(
      { templateId: IdString, ...SaveTemplateVersionBody.properties },
      { additionalProperties: false },
    ),
    output: Type.Object({ templateId: IdString, version: TemplateVersion }, { additionalProperties: false }),
    examples: [
      {
        input: {
          templateId: "t_example1",
          metadata: {
            schemaVersion: 1,
            kind: "object",
            label: "My figure",
            contract: "Areable",
            attachment: { hosts: ["floor"], contact: "bottom" },
            resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
            flip: { x: false, z: false },
            opening: null,
            materialSlots: {},
          },
          rootTransform: { scale: 1, upAxis: "+y", frontAxis: "+z" },
        },
      },
    ],
    run: ({ templateId, ...body }) => ({
      data: undefined,
      action: async (ensureOpen) => {
        const version = await templateCall(() =>
          context.templates.saveVersion(context.session.houseId, templateId, body),
        );
        ensureOpen();
        context.onTemplatesChanged?.();
        return { templateId, version };
      },
    }),
  }),
];
