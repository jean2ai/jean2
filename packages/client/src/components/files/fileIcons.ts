const FILE_ICON_COLORS: Record<string, string> = {
  '.ts': 'text-file-ts',
  '.tsx': 'text-file-ts',
  '.js': 'text-file-js',
  '.jsx': 'text-file-js',
  '.json': 'text-file-json',
  '.md': 'text-file-md',
  '.css': 'text-file-css',
  '.html': 'text-file-html',
};

export const FOLDER_ICON_COLOR = 'text-file-folder';

export function fileIconColor(path: string): string {
  const dotIdx = path.lastIndexOf('.');
  if (dotIdx === -1) return 'text-file-default';
  return FILE_ICON_COLORS[path.slice(dotIdx)] ?? 'text-file-default';
}
