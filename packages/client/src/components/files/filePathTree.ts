export interface FilePathDirectoryNode<T> {
  name: string;
  path: string;
  directories: FilePathDirectoryNode<T>[];
  files: T[];
  fileCount: number;
}

export interface FilePathTree<T> {
  directories: FilePathDirectoryNode<T>[];
  files: T[];
}

interface PathEntry {
  path: string;
}

function getFileName(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

export function buildFilePathTree<T extends PathEntry>(files: T[]): FilePathTree<T> {
  interface BuilderDirectory {
    name: string;
    path: string;
    directories: Map<string, BuilderDirectory>;
    files: T[];
  }

  const root: BuilderDirectory = {
    name: '',
    path: '',
    directories: new Map(),
    files: [],
  };

  for (const file of files) {
    const segments = file.path.split('/');
    const directorySegments = segments.slice(0, -1);
    const fileName = segments[segments.length - 1];

    if (!fileName) continue;

    let current = root;
    for (const segment of directorySegments) {
      if (!segment) continue;

      let child = current.directories.get(segment);
      if (!child) {
        child = {
          name: segment,
          path: current.path ? `${current.path}/${segment}` : segment,
          directories: new Map(),
          files: [],
        };
        current.directories.set(segment, child);
      }
      current = child;
    }
    current.files.push(file);
  }

  function convert(directory: BuilderDirectory): FilePathDirectoryNode<T> {
    const directories = Array.from(directory.directories.values())
      .map(convert)
      .sort((a, b) => a.name.localeCompare(b.name));
    const sortedFiles = [...directory.files].sort((a, b) =>
      getFileName(a.path).localeCompare(getFileName(b.path)),
    );
    const fileCount = sortedFiles.length
      + directories.reduce((sum, child) => sum + child.fileCount, 0);

    return {
      name: directory.name,
      path: directory.path,
      directories,
      files: sortedFiles,
      fileCount,
    };
  }

  return {
    directories: Array.from(root.directories.values())
      .map(convert)
      .sort((a, b) => a.name.localeCompare(b.name)),
    files: [...root.files].sort((a, b) =>
      getFileName(a.path).localeCompare(getFileName(b.path)),
    ),
  };
}
