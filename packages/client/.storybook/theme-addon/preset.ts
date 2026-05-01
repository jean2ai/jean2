import path from 'path';

export default {
  previewAnnotations: (entry: string[] = []) => [
    ...entry,
    path.resolve(import.meta.dirname, 'register.ts'),
  ],
};
