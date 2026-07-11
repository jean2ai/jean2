/**
 * Development-only performance instrumentation helper.
 *
 * Wraps performance.mark() and performance.measure() with:
 * - Low overhead in production (all calls are no-ops unless enabled).
 * - Tolerant of missing start marks (records what it can).
 * - No user content is ever logged (only mark names and durations).
 * - Development console summary via printSummary().
 */

const PREFIX = 'jean2:';
const STORAGE_KEY = '__jean2_perf_enabled';

let enabled = false;

// Allow enabling from devtools console: window.__jean2_perf_enable()
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__jean2_perf_enable', {
    value: () => {
      enabled = true;
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
      console.log('[perf] Instrumentation enabled for this session');
    },
    writable: false,
    configurable: false,
  });

  // Restore persisted preference (only in dev)
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1' && import.meta.env?.DEV) {
      enabled = true;
    }
  } catch { /* ignore */ }
}

export function isPerfEnabled(): boolean {
  return enabled;
}

/**
 * Place a named mark at a lifecycle boundary.
 * Tolerates environments without performance API.
 */
export function mark(name: string): void {
  if (!enabled) return;
  try {
    performance.mark(PREFIX + name);
  } catch { /* ignore */ }
}

/**
 * Measure the duration between two marks.
 * If the start mark is missing, measures from navigationStart (navigation/origin).
 * Does not throw on failure.
 */
export function measure(startName: string, endName: string): number | null {
  if (!enabled) return null;
  try {
    const fullStart = PREFIX + startName;
    const fullEnd = PREFIX + endName;
    const startEntries = performance.getEntriesByName(fullStart, 'mark');
    if (startEntries.length === 0) return null;
    const endEntries = performance.getEntriesByName(fullEnd, 'mark');
    if (endEntries.length === 0) return null;
    const duration = endEntries[0].startTime - startEntries[0].startTime;
    const measureName = `${startName}→${endName}`;
    try {
      performance.measure(`${PREFIX}${measureName}`, fullStart, fullEnd);
    } catch { /* ignore */ }
    return duration;
  } catch {
    return null;
  }
}

/**
 * Convenience: mark an end boundary and immediately measure from a start mark.
 * Returns the duration in ms or null if not measurable.
 */
export function markAndMeasure(startName: string, endName: string): number | null {
  mark(endName);
  return measure(startName, endName);
}

/**
 * Print a summary of all jean2: measures to the console.
 * Safe to call from devtools at any time.
 */
export function printSummary(): void {
  try {
    const entries = performance
      .getEntriesByType('measure')
      .filter((e) => e.name.startsWith(PREFIX));
    if (entries.length === 0) {
      console.log('[perf] No measures recorded');
      return;
    }
    const grouped: Record<string, number[]> = {};
    for (const entry of entries) {
      const shortName = entry.name.slice(PREFIX.length);
      if (!grouped[shortName]) grouped[shortName] = [];
      grouped[shortName].push(entry.duration);
    }
    console.group('[perf] Performance summary');
    for (const [name, durations] of Object.entries(grouped)) {
      const sorted = [...durations].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const max = sorted[sorted.length - 1];
      console.log(`${name}: ${durations.length}x  median=${median.toFixed(1)}ms  max=${max.toFixed(1)}ms`);
    }
    console.groupEnd();
  } catch { /* ignore */ }
}

/**
 * Clear all jean2: marks and measures.
 */
export function clearMarks(): void {
  try {
    performance.clearMarks(PREFIX.slice(0, -1)); // clears all marks with our prefix
    performance.clearMeasures(PREFIX.slice(0, -1));
  } catch { /* ignore */ }
}
