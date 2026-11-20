// The fake Home Assistant's window.homeplan bridge (Phase 21.18, dev harness only; owner: control the fake HA
// through the window as the Floor Builder's bridge does, spec/architecture/browser-automation.md). The same shape
// as the builder's bridges: `describe()` (API version "1", level "fake-ha", instructions, the tools with schemas and
// examples), `tools.<name>(input)` and `callTool(name, input)`, each resolving to `{ ok: true, data }` or
// `{ ok: false, error: { code, message } }`. Everything Setup HA does is here: the entities (kept in this browser),
// service calls, the step controls, dark mode, the renderer and the demo bubbles. Fake data only; nothing leaves the
// page except what the controls already write (demo bubbles to the builder's preferences).
import Type from "typebox";
import type { TSchema } from "typebox";
import { compileValidator } from "@shared/domain/validation/ajv";
import type { FakeHaStore } from "./fakeHaStore";
import type { FakeHaControl } from "./fakeHaSetup";

export type FakeHaBridgeContext = Readonly<{
  store: FakeHaStore;
  /** Applies a change of the stored entities to the panel and the cards. */
  refresh: () => void;
  /** A service call through the fake HA (as the viewer's own; it shows as the last action). */
  callService: (domain: string, service: string, data: Readonly<Record<string, unknown>>) => void;
  controls: () => readonly FakeHaControl[];
  lastAction: () => string;
  setDarkMode: (on: boolean) => void;
  renderers: () => readonly Readonly<{ id: string; label: string; current: boolean }>[];
  /** Saves this browser's renderer and reloads; false for an unknown one. */
  setRenderer: (id: string) => boolean;
  /** Writes the demo bubbles for the house shown, then reloads. */
  writeDemoBubbles: () => Promise<void>;
}>;

type ErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "INTERNAL_ERROR";
type Result =
  | Readonly<{ ok: true; data: unknown }>
  | Readonly<{ ok: false; error: { code: ErrorCode; message: string } }>;

class BridgeError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Tool = Readonly<{
  name: string;
  description: string;
  effect: "read" | "change" | "reload";
  inputSchema: TSchema;
  examples: readonly unknown[];
  run: (input: Readonly<Record<string, unknown>>) => unknown;
}>;

const Empty = Type.Object({}, { additionalProperties: false });
const EntityId = Type.String({ pattern: "^[a-z_]+\\.[a-z0-9_]+$", description: "domain.object_id" });
const Attributes = Type.Record(Type.String(), Type.Unknown());

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const record = (value: unknown): Readonly<Record<string, unknown>> => (isRecord(value) ? value : {});

export const createFakeHaBridge = (context: FakeHaBridgeContext) => {
  const { store } = context;
  const entityOf = (entityId: string) => {
    const entry = store.list().find((item) => item.entityId === entityId);
    if (entry === undefined) throw new BridgeError("NOT_FOUND", `No entity ${entityId}. Call list_entities.`);
    return {
      entityId,
      state: entry.entity.state,
      attributes: entry.entity.attributes,
      area: entry.area,
      changedHere: entry.stored,
    };
  };
  const tools: readonly Tool[] = [
    {
      name: "list_entities",
      description:
        "Every fake entity (demo and Setup HA's): ID, state, attributes, area (a room name) and whether it was changed here.",
      effect: "read",
      inputSchema: Empty,
      examples: [{}],
      run: () => ({ entities: store.list().map((item) => entityOf(item.entityId)) }),
    },
    {
      name: "get_entity",
      description: "One entity.",
      effect: "read",
      inputSchema: Type.Object({ entityId: EntityId }, { additionalProperties: false }),
      examples: [{ entityId: "light.kitchen" }],
      run: (input) => ({ entity: entityOf(text(input.entityId)) }),
    },
    {
      name: "set_entity",
      description:
        "Creates or replaces an entity, kept in this browser and applied at once. Omitted fields keep the current value (attributes are replaced as a whole when given; name sets friendly_name). An area named like a room puts it in that room's cards.",
      effect: "change",
      inputSchema: Type.Object(
        {
          entityId: EntityId,
          state: Type.String(),
          name: Type.Optional(Type.String()),
          area: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          attributes: Type.Optional(Attributes),
        },
        { additionalProperties: false },
      ),
      examples: [
        { entityId: "light.bedside_lamp", state: "on", name: "Bedside lamp", area: "Bedroom" },
        { entityId: "sensor.bedroom_temperature", state: "21.5", attributes: { unit_of_measurement: "°C" } },
      ],
      run: (input) => {
        const entityId = text(input.entityId);
        const current = store.list().find((item) => item.entityId === entityId);
        const name = typeof input.name === "string" ? input.name : current?.entity.attributes.friendly_name;
        const attributes =
          input.attributes === undefined ? (current?.entity.attributes ?? {}) : record(input.attributes);
        store.save(entityId, {
          state: text(input.state),
          attributes: { ...attributes, ...(typeof name === "string" ? { friendly_name: name } : {}) },
          area:
            input.area === undefined
              ? (current?.area ?? null)
              : typeof input.area === "string"
                ? input.area
                : null,
        });
        context.refresh();
        return { entity: entityOf(entityId) };
      },
    },
    {
      name: "delete_entity",
      description: "Removes an entity (a demo one is hidden until reset_entities).",
      effect: "change",
      inputSchema: Type.Object({ entityId: EntityId }, { additionalProperties: false }),
      examples: [{ entityId: "light.bedside_lamp" }],
      run: (input) => {
        const entityId = text(input.entityId);
        entityOf(entityId);
        store.remove(entityId);
        context.refresh();
        return { entityId };
      },
    },
    {
      name: "reset_entities",
      description: "Forgets every change made here; the demo entities come back.",
      effect: "change",
      inputSchema: Empty,
      examples: [{}],
      run: () => {
        store.reset();
        context.refresh();
        return {};
      },
    },
    {
      name: "call_service",
      description:
        "Calls a service as the viewer and HA's cards do (for example light.toggle with entity_id). The fakes answer lights, covers, climate, lock, media player, select and toggle/turn_on/turn_off.",
      effect: "change",
      inputSchema: Type.Object(
        { domain: Type.String(), service: Type.String(), data: Type.Optional(Attributes) },
        { additionalProperties: false },
      ),
      examples: [{ domain: "light", service: "toggle", data: { entity_id: "light.kitchen" } }],
      run: (input) => {
        context.callService(text(input.domain), text(input.service), record(input.data));
        return { lastAction: context.lastAction() };
      },
    },
    {
      name: "list_controls",
      description: "The step controls of Setup HA → Controls (IDs for run_control), by group.",
      effect: "read",
      inputSchema: Empty,
      examples: [{}],
      run: () => ({
        controls: context.controls().map(({ id, label, group }) => ({ id, label, group })),
      }),
    },
    {
      name: "run_control",
      description: "Runs one step control, as its button does (for example night, climate, washer).",
      effect: "change",
      inputSchema: Type.Object({ id: Type.String() }, { additionalProperties: false }),
      examples: [{ id: "night" }, { id: "toggle-test" }],
      run: (input) => {
        const control = context.controls().find((each) => each.id === input.id);
        if (control === undefined)
          throw new BridgeError("NOT_FOUND", `No control ${text(input.id)}. Call list_controls.`);
        control.run();
        return { id: control.id, lastAction: context.lastAction() };
      },
    },
    {
      name: "set_dark_mode",
      description: "Home Assistant's dark theme on or off.",
      effect: "change",
      inputSchema: Type.Object({ on: Type.Boolean() }, { additionalProperties: false }),
      examples: [{ on: true }],
      run: (input) => {
        context.setDarkMode(input.on === true);
        return { on: input.on === true };
      },
    },
    {
      name: "get_last_action",
      description: "The last service call or more-info the viewer (or a card) made.",
      effect: "read",
      inputSchema: Empty,
      examples: [{}],
      run: () => ({ lastAction: context.lastAction() }),
    },
    {
      name: "list_renderers",
      description: "The viewer's renderers and which one this browser uses.",
      effect: "read",
      inputSchema: Empty,
      examples: [{}],
      run: () => ({ renderers: context.renderers() }),
    },
    {
      name: "set_renderer",
      description:
        "Chooses this browser's renderer; the page reloads, so reacquire window.homeplan afterwards.",
      effect: "reload",
      inputSchema: Type.Object({ id: Type.String() }, { additionalProperties: false }),
      examples: [{ id: "dithered" }],
      run: (input) => {
        if (!context.setRenderer(text(input.id)))
          throw new BridgeError("NOT_FOUND", `No renderer ${text(input.id)}. Call list_renderers.`);
        return { id: input.id };
      },
    },
    {
      name: "write_demo_bubbles",
      description:
        "Writes demo bubbles for the house shown (a temperature and a washer bubble, a camera icon) to the builder's preferences, replacing that house's bubbles; the page reloads.",
      effect: "reload",
      inputSchema: Empty,
      examples: [{}],
      run: async () => {
        await context.writeDemoBubbles();
        return {};
      },
    },
  ];
  const validators = new Map(tools.map((tool) => [tool.name, compileValidator(tool.inputSchema)]));
  const callTool = async (name: string, input: unknown = {}): Promise<Result> => {
    try {
      const tool = tools.find((each) => each.name === name);
      if (tool === undefined)
        throw new BridgeError("NOT_FOUND", `Unknown tool: ${name}. Call describe() for available tools.`);
      if (validators.get(name)?.(input) !== true)
        throw new BridgeError(
          "INVALID_INPUT",
          `The input does not match ${name}'s inputSchema (see describe()).`,
        );
      const data: unknown = await tool.run(record(input));
      return { ok: true, data };
    } catch (error: unknown) {
      return error instanceof BridgeError
        ? { ok: false, error: { code: error.code, message: error.message } }
        : {
            ok: false,
            error: {
              code: "INTERNAL_ERROR",
              message: error instanceof Error ? error.message : String(error),
            },
          };
    }
  };
  return {
    apiVersion: "1",
    describe: () => ({
      apiVersion: "1",
      level: "fake-ha",
      instructions:
        "This is the dev harness's fake Home Assistant (no real devices). Read entities with list_entities, change them with set_entity or call_service, and step the demo devices with run_control. Changes apply to the viewer and HA's cards at once and are kept in this browser; reset_entities forgets them. set_renderer and write_demo_bubbles reload the page.",
      tools: tools.map((tool) => ({
        name: tool.name,
        functionPath: `window.homeplan.tools.${tool.name}`,
        description: tool.description,
        effect: tool.effect,
        inputSchema: tool.inputSchema,
        examples: tool.examples.map((input) => ({ input })),
      })),
    }),
    tools: Object.fromEntries(
      tools.map((tool) => [tool.name, (input: unknown = {}) => callTool(tool.name, input)]),
    ),
    callTool,
  };
};
