export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export enum LSPOperation {
  Definition = 'definition',
  References = 'references',
  Hover = 'hover',
  DocumentSymbol = 'documentSymbol',
  WorkspaceSymbol = 'workspaceSymbol',
  Diagnostics = 'diagnostics',
}

export type DefinitionResult = Location[] | null;
export type ReferencesResult = Location[];
export type HoverResult = {
  content: string;
  range?: Range;
};
export type DocumentSymbolResult = SymbolInformation[];
export type DiagnosticResult = Diagnostic[];

export type LSPOperationResult =
  | DefinitionResult
  | ReferencesResult
  | HoverResult
  | DocumentSymbolResult
  | DiagnosticResult;

export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

export interface SymbolInformation {
  name: string;
  kind: SymbolKind;
  location: Location;
  containerName?: string;
}

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface Diagnostic {
  range: Range;
  severity: DiagnosticSeverity;
  code?: number | string;
  source?: string;
  message: string;
}

export enum LSPClientStatus {
  Starting = 'starting',
  Ready = 'ready',
  Error = 'error',
  Stopped = 'stopped',
}

export interface LSPClientInfo {
  languageId: string;
  status: LSPClientStatus;
  error?: string;
  capabilities?: Record<string, unknown>;
}

export interface LSPManagerConfig {
  workspaceRoot: string;
  supportedLanguages: string[];
  initializationOptions?: Record<string, unknown>;
}

export interface OpenFileInfo {
  uri: string;
  languageId: string;
  version: number;
  content: string;
}

export type WorkspaceId = string;

export interface WorkspaceSessionInfo {
  workspaceId: WorkspaceId;
  workspaceRoot: string;
  lastAccessedAt: number;
  createdAt: number;
}

export interface InitializeRequest {
  workspaceId: WorkspaceId;
  workspaceRoot: string;
}

export interface WorkspaceOperationRequest {
  workspaceId: WorkspaceId;
}
