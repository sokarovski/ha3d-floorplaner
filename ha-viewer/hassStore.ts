// The framework-free Home Assistant state store (spec/home-assistant/viewer-mvp.md#reactivity).
// HA assigns a new `hass` on every state change of any entity; this store notifies only the subscribers
// of entities whose state object changed (HA keeps the object identity of unchanged entities).
import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { HaRegistries } from "@shared/domain/homeAssistant/suggestions";

export type HassEntity = Readonly<{
  entity_id: string;
  state: string;
  attributes: Readonly<Record<string, unknown>>;
  last_changed: string;
}>;

export type Hass = Readonly<{
  states: Readonly<Record<string, HassEntity | undefined>>;
  user?: Readonly<{ is_admin: boolean }>;
  fetchWithAuth?: (path: string, init?: RequestInit) => Promise<Response>;
  /** HA's entity, device, and area registries (the frontend's `hass.entities`, `devices`, `areas`; 10.3). */
  entities?: HaRegistries["entities"];
  devices?: HaRegistries["devices"];
  areas?: HaRegistries["areas"];
  themes?: Readonly<{ darkMode?: boolean }>;
  /** HA's core configuration: the home's location (degrees), used when there is no `sun.sun` entity. */
  config?: Readonly<{ latitude?: number; longitude?: number }>;
  /** HA's websocket call (frontend `hass.callWS`). */
  callWS: (message: Readonly<Record<string, unknown>>) => Promise<unknown>;
  /** HA's service call (frontend `hass.callService`). */
  callService: (
    domain: string,
    service: string,
    data?: Readonly<Record<string, unknown>>,
    target?: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
}>;

type Listener = () => void;

export type HassStore = Readonly<{
  set: (hass: Hass) => void;
  current: () => Hass | null;
  entity: (entityId: string) => HassEntity | undefined;
  /** Called only when this entity's state object changes. */
  subscribeEntity: (entityId: string, listener: Listener) => () => void;
  darkMode: () => boolean;
  /** Called when hass first arrives and when dark mode changes; never on ordinary state changes. */
  subscribeMeta: (listener: Listener) => () => void;
  /** Called on every new `hass` (for HA cards, which take the whole object). */
  subscribeHass: (listener: Listener) => () => void;
}>;

export const createHassStore = (): HassStore => {
  let hass: Hass | null = null;
  const entityListeners = new Map<string, Set<Listener>>();
  const metaListeners = new Set<Listener>();
  const hassListeners = new Set<Listener>();

  const notify = (listeners: Iterable<Listener>): void => {
    for (const listener of [...listeners]) listener();
  };

  return {
    set: (next) => {
      const previous = hass;
      hass = next;
      notify(hassListeners);
      if (previous === null || previous.themes?.darkMode !== next.themes?.darkMode) notify(metaListeners);
      if (previous === null || previous.states === next.states) {
        if (previous === null) for (const listeners of entityListeners.values()) notify(listeners);
        return;
      }
      for (const [entityId, listeners] of entityListeners)
        if (previous.states[entityId] !== next.states[entityId]) notify(listeners);
    },
    current: () => hass,
    entity: (entityId) => hass?.states[entityId],
    subscribeEntity: (entityId, listener) => {
      const listeners = entityListeners.get(entityId) ?? new Set<Listener>();
      entityListeners.set(entityId, listeners);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        // A repeated unsubscribe must not drop a newer set registered for the same entity.
        if (listeners.size === 0 && entityListeners.get(entityId) === listeners)
          entityListeners.delete(entityId);
      };
    },
    subscribeHass: (listener) => {
      hassListeners.add(listener);
      return () => hassListeners.delete(listener);
    },
    darkMode: () => hass?.themes?.darkMode === true,
    subscribeMeta: (listener) => {
      metaListeners.add(listener);
      return () => metaListeners.delete(listener);
    },
  };
};

/** Re-renders its host only when one entity changes. */
export class EntityController implements ReactiveController {
  private readonly host: ReactiveControllerHost;
  private readonly store: HassStore;
  private entityId: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private connected = false;

  constructor(host: ReactiveControllerHost, store: HassStore) {
    this.host = host;
    this.store = store;
    host.addController(this);
  }

  get value(): HassEntity | undefined {
    return this.entityId === null ? undefined : this.store.entity(this.entityId);
  }

  setEntityId(entityId: string | null): void {
    if (entityId === this.entityId) return;
    this.entityId = entityId;
    this.resubscribe();
  }

  hostConnected(): void {
    this.connected = true;
    this.resubscribe();
  }

  hostDisconnected(): void {
    this.connected = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private resubscribe(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.connected && this.entityId !== null)
      this.unsubscribe = this.store.subscribeEntity(this.entityId, () => {
        this.host.requestUpdate();
      });
  }
}

/** Re-renders its host when any of a set of entities changes (one subscription per entity). */
export class EntitiesController implements ReactiveController {
  private readonly host: ReactiveControllerHost;
  private readonly store: HassStore;
  private entityIds: readonly string[] = [];
  private unsubscribes: (() => void)[] = [];
  private connected = false;

  constructor(host: ReactiveControllerHost, store: HassStore) {
    this.host = host;
    this.store = store;
    host.addController(this);
  }

  setEntityIds(entityIds: Iterable<string>): void {
    const next = [...new Set(entityIds)].sort();
    if (next.join("|") === this.entityIds.join("|")) return;
    this.entityIds = next;
    this.resubscribe();
  }

  hostConnected(): void {
    this.connected = true;
    this.resubscribe();
  }

  hostDisconnected(): void {
    this.connected = false;
    this.unsubscribeAll();
  }

  private unsubscribeAll(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes = [];
  }

  private resubscribe(): void {
    this.unsubscribeAll();
    if (!this.connected) return;
    this.unsubscribes = this.entityIds.map((entityId) =>
      this.store.subscribeEntity(entityId, () => {
        this.host.requestUpdate();
      }),
    );
  }
}
