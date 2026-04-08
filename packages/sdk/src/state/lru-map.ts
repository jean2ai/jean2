export class LruMap<K, V> {
  private map = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    this.evictIfNeeded();
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  peek(key: K): V | undefined {
    return this.map.get(key);
  }

  peekOldest(): { key: K; value: V } | undefined {
    const firstKey = this.map.keys().next().value;
    if (firstKey === undefined) return undefined;
    return { key: firstKey, value: this.map.get(firstKey)! };
  }

  onEvict: ((key: K, value: V) => void) | null = null;

  private evictIfNeeded(): void {
    if (this.maxSize <= 0) return;
    while (this.map.size > this.maxSize) {
      const oldest = this.peekOldest();
      if (!oldest) break;
      this.map.delete(oldest.key);
      this.onEvict?.(oldest.key, oldest.value);
    }
  }
}
