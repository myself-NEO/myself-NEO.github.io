// A tiny localStorage-backed store for useSyncExternalStore. Reads and writes are
// guarded: when storage is unavailable (private windows, blocked site data) the
// state lives for the session only. Other tabs are kept in sync via `storage` events.

interface StoreOptions<T> {
  key: string;
  /** Older keys to read from when `key` is empty, so data survives a rename. */
  legacyKeys?: string[];
  empty: T;
  /** Turns parsed JSON into a well-formed state, dropping anything malformed. */
  sanitize: (parsed: unknown) => T;
}

export interface Store<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
}

export const createStore = <T,>({ key, legacyKeys = [], empty, sanitize }: StoreOptions<T>): Store<T> => {
  const read = (): T => {
    try {
      for (const k of [key, ...legacyKeys]) {
        const raw = window.localStorage.getItem(k);
        if (raw) return sanitize(JSON.parse(raw));
      }
    } catch {
      // Unreadable or unavailable storage: start empty.
    }
    return empty;
  };

  let state = read();
  const listeners = new Set<() => void>();

  const set = (next: T) => {
    state = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage unavailable or full: keep the state for this session only.
    }
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) {
        state = read();
        listener();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  };

  return { get: () => state, set, subscribe };
};
