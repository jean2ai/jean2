export type RuntimeSetupId = string;

export interface RuntimeInstallMethod {
  name: string;
  command: string;
  notes?: string;
}

export interface PlatformRuntimeSetup {
  methods: RuntimeInstallMethod[];
  prereqNotes?: string;
}

export interface RuntimeSetup {
  id: RuntimeSetupId;
  displayName: string;
  verifyCommand: string;
  docsUrl: string;
  platforms: {
    darwin?: PlatformRuntimeSetup;
    linux?: PlatformRuntimeSetup;
    win32?: PlatformRuntimeSetup;
  };
}

export interface RuntimeSetupResult {
  success: boolean;
  version?: string;
  error?: string;
}