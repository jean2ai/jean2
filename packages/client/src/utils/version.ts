export type UpdateStatus = 'up-to-date' | 'update-available' | 'unknown';

export function parseVersion(raw: string): [number, number, number] | null {
  const match = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va && !vb) return 0;
  if (!va) return -1;
  if (!vb) return 1;
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] - vb[i];
  }
  return 0;
}

export function checkUpdate(current: string, latest: string | null): UpdateStatus {
  if (!latest) return 'unknown';
  if (compareVersions(current, latest) >= 0) return 'up-to-date';
  return 'update-available';
}
