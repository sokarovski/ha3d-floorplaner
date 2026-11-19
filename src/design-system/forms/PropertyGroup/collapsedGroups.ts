// Session memory of collapsed property groups by catalog group ID (Phase 5.7): shared across object types,
// never saved.
const collapsed = new Set<string>();
const listeners = new Set<() => void>();

export const collapsedGroups = {
  has: (groupId: string): boolean => collapsed.has(groupId),
  set: (groupId: string, isCollapsed: boolean): void => {
    if (collapsed.has(groupId) === isCollapsed) return;
    if (isCollapsed) collapsed.add(groupId);
    else collapsed.delete(groupId);
    for (const listener of listeners) listener();
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
