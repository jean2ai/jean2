export interface Workspace {
  id: string;
  name: string;
  path: string;
  isVirtual: boolean;
  additionalPaths: string[];
  createdAt: string;
  updatedAt: string;
}
