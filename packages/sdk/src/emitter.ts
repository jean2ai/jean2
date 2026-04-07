export type EventMap = Record<string, unknown[]>;

export class TypedEventEmitter<Events extends EventMap> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private listeners = new Map<string, Set<Function>>();

  on<K extends keyof Events & string>(
    event: K,
    handler: (...args: Events[K]) => void
  ): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return this;
  }

  once<K extends keyof Events & string>(
    event: K,
    handler: (...args: Events[K]) => void
  ): this {
    const wrappedHandler: (...args: Events[K]) => void = (...args: Events[K]) => {
      this.off(event, wrappedHandler);
      handler(...args);
    };
    return this.on(event, wrappedHandler);
  }

  off<K extends keyof Events & string>(
    event: K,
    handler: (...args: Events[K]) => void
  ): this {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
    return this;
  }

  emit<K extends keyof Events & string>(
    event: K,
    ...args: Events[K]
  ): boolean {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return false;
    for (const handler of set) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`Error in event handler for "${event}":`, err);
      }
    }
    return true;
  }

  removeAllListeners<K extends keyof Events & string>(event?: K): this {
    if (event !== undefined) {
      this.listeners.delete(event as string);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  listenerCount<K extends keyof Events & string>(event: K): number {
    return this.listeners.get(event as string)?.size ?? 0;
  }

  eventNames(): Array<keyof Events & string> {
    return Array.from(this.listeners.keys()) as Array<keyof Events & string>;
  }
}
