// Identity memo for derived geometry that never caches on an Immer draft. Geometry caches are keyed by document
// object identity, which holds for immutable documents only: inside one produce a draft keeps its identity while it
// is mutated, so a cached result would go stale within the same command (and a batch would differ from the same
// commands run one by one). Drafts are computed fresh every time; finished documents are cached as before.
import { isDraft } from "immer";

export class DraftSafeWeakMap<K extends object, V> {
  private readonly map = new WeakMap<K, V>();

  get(key: K): V | undefined {
    return isDraft(key) ? undefined : this.map.get(key);
  }

  set(key: K, value: V): this {
    if (!isDraft(key)) this.map.set(key, value);
    return this;
  }
}
