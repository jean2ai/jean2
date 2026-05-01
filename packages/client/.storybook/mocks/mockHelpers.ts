// =============================================================================
// Mock Helpers — ID and timestamp generators for story mock data
// =============================================================================

let _idCounter = 0;

/** Generate a mock ID (e.g. "mock-abc123") */
export function mockId(prefix = 'mock'): string {
  _idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${rand}${_idCounter}`;
}

/** Reset the ID counter (useful between stories) */
export function resetMockIds(): void {
  _idCounter = 0;
}

/** Current Unix timestamp in ms */
export function mockNow(): number {
  return Date.now();
}

/** Unix timestamp N seconds ago */
export function mockSecondsAgo(seconds: number): number {
  return Date.now() - seconds * 1000;
}

/** Unix timestamp N minutes ago */
export function mockMinutesAgo(minutes: number): number {
  return Date.now() - minutes * 60 * 1000;
}

/** Unix timestamp N hours ago */
export function mockHoursAgo(hours: number): number {
  return Date.now() - hours * 60 * 60 * 1000;
}

/** ISO timestamp N minutes ago */
export function mockIsoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

/** ISO timestamp N hours ago */
export function mockIsoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/** Current ISO timestamp */
export function mockIsoNow(): string {
  return new Date().toISOString();
}

/** Shallow merge utility for factory overrides */
export function merge<T extends object>(base: T, overrides: Partial<T>): T {
  return { ...base, ...overrides };
}
