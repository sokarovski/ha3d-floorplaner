// System routes: GET /api/health and GET /api/capabilities (spec/architecture/api.md#system).
import Type from "typebox";
import type { Static } from "typebox";

export const HealthResponse = Type.Object({ status: Type.Literal("ok") }, { additionalProperties: false });
export type HealthResponseValue = Static<typeof HealthResponse>;

/** Upload limits from D16 and optional server features. */
export const CapabilitiesResponse = Type.Object(
  {
    houseSnapshots: Type.Optional(
      Type.Object(
        {
          formatVersions: Type.Array(Type.Integer()),
          viewerProtocols: Type.Array(Type.Integer()),
          producerVersion: Type.String(),
          limits: Type.Record(Type.String(), Type.Integer()),
        },
        { additionalProperties: false },
      ),
    ),
    viewerFrontend: Type.Optional(
      Type.Object(
        {
          available: Type.Boolean(),
          formatVersions: Type.Array(Type.Integer()),
          loaderProtocols: Type.Array(Type.Integer()),
          apiProtocols: Type.Array(Type.Integer()),
          limits: Type.Record(Type.String(), Type.Integer()),
        },
        { additionalProperties: false },
      ),
    ),
    uploadLimits: Type.Object(
      {
        image: Type.Object(
          {
            maxBytes: Type.Integer({ minimum: 1 }),
            maxLongestSidePx: Type.Integer({ minimum: 1 }),
            mediaTypes: Type.Array(Type.String()),
          },
          { additionalProperties: false },
        ),
        model: Type.Object({ maxBytes: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
      },
      { additionalProperties: false },
    ),
    /** `renderer` names the backend engine when available, for example `{ name: "blender-cycles", version: "4.0.2" }`. */
    photorealRender: Type.Object(
      {
        available: Type.Boolean(),
        reason: Type.Union([Type.String(), Type.Null()]),
        renderer: Type.Union([
          Type.Object({ name: Type.String(), version: Type.String() }, { additionalProperties: false }),
          Type.Null(),
        ]),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type CapabilitiesResponseValue = Static<typeof CapabilitiesResponse>;
