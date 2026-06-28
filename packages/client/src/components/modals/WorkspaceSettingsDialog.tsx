import { useState, useEffect } from 'react';
import { Brain, Wrench, Search, Workflow, Server, Shield, FolderSymlink, Clock } from 'lucide-react';
import type { Workspace, WorkspaceSettings, PermissionRiskLevel, PermissionGrant, Jean2Client } from '@jean2/sdk';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MemoryPanel } from './configuration/MemoryPanel';
import { SkillsPanel } from './configuration/SkillsPanel';
import { SessionSearchPanel } from './configuration/SessionSearchPanel';
import { WorkflowPanel } from './configuration/WorkflowPanel';
import { SchedulingPanel } from './configuration/SchedulingPanel';
import { MCPServersPanel } from './configuration/MCPServersPanel';
import { PermissionsPanel } from './configuration/PermissionsPanel';
import { AdditionalPathsPanel } from './configuration/AdditionalPathsPanel';

type Section = 'mcp' | 'permissions' | 'paths' | 'memory' | 'skills' | 'search' | 'workflow' | 'scheduling';

interface SectionDef {
  value: Section;
  label: string;
  icon: typeof Brain;
  group: 'general' | 'capabilities';
}

const SECTIONS: SectionDef[] = [
  { value: 'mcp', label: 'MCP Servers', icon: Server, group: 'general' },
  { value: 'permissions', label: 'Permissions', icon: Shield, group: 'general' },
  { value: 'paths', label: 'Additional Paths', icon: FolderSymlink, group: 'general' },
  { value: 'memory', label: 'Memory', icon: Brain, group: 'capabilities' },
  { value: 'skills', label: 'Skills', icon: Wrench, group: 'capabilities' },
  { value: 'search', label: 'Session Search', icon: Search, group: 'capabilities' },
  { value: 'workflow', label: 'Workflow', icon: Workflow, group: 'capabilities' },
  { value: 'scheduling', label: 'Scheduling', icon: Clock, group: 'capabilities' },
];

const CAPABILITY_SECTIONS = SECTIONS.filter((s) => s.group === 'capabilities');

interface WorkspaceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  onSave: (workspaceId: string, settings: WorkspaceSettings) => void;
  sdkClient: Jean2Client | null;
  permissions: PermissionGrant[];
  onRefreshPermissions: () => void;
  onRevokePermission: (permissionId: string) => void;
  onRevokeAllPermissions: () => void;
  onUpdateWorkspacePaths: (workspaceId: string, additionalPaths: string[]) => void;
}

export function WorkspaceSettingsDialog({
  open,
  onOpenChange,
  workspace,
  onSave,
  sdkClient,
  permissions,
  onRefreshPermissions,
  onRevokePermission,
  onRevokeAllPermissions,
  onUpdateWorkspacePaths,
}: WorkspaceSettingsDialogProps) {
  const [section, setSection] = useState<Section>('mcp');

  // Local state for capability settings
  const [memory, setMemory] = useState({ enabled: false, permissionRisk: 'medium' as PermissionRiskLevel });
  const [skills, setSkills] = useState({ enabled: false, permissionRisk: 'medium' as PermissionRiskLevel });
  const [search, setSearch] = useState({ enabled: false, permissionRisk: 'medium' as PermissionRiskLevel, includeToolResults: false });
  const [workflow, setWorkflow] = useState(false);
  const [scheduling, setScheduling] = useState({ enabled: false, permissionRisk: 'medium' as PermissionRiskLevel });

  useEffect(() => {
    if (open) {
      const s = workspace.settings;
      setMemory({ enabled: s?.memory?.enabled ?? false, permissionRisk: s?.memory?.permissionRisk ?? 'medium' });
      setSkills({ enabled: s?.skills?.managementEnabled ?? false, permissionRisk: s?.skills?.permissionRisk ?? 'medium' });
      setSearch({
        enabled: s?.sessionSearch?.enabled ?? false,
        permissionRisk: s?.sessionSearch?.permissionRisk ?? 'medium',
        includeToolResults: s?.sessionSearch?.includeToolResults ?? false,
      });
      setWorkflow(s?.workflow?.enabled ?? false);
      setScheduling({ enabled: s?.scheduling?.enabled ?? false, permissionRisk: s?.scheduling?.permissionRisk ?? 'medium' });
    }
  }, [open, workspace.settings]);

  const isCapability = section === 'memory' || section === 'skills' || section === 'search' || section === 'workflow' || section === 'scheduling';

  const handleSave = () => {
    onSave(workspace.id, {
      ...workspace.settings,
      memory: { enabled: memory.enabled, permissionRisk: memory.permissionRisk },
      skills: { managementEnabled: skills.enabled, permissionRisk: skills.permissionRisk },
      sessionSearch: {
        enabled: search.enabled,
        permissionRisk: search.permissionRisk,
        includeToolResults: search.includeToolResults,
      },
      workflow: { enabled: workflow },
      scheduling: { enabled: scheduling.enabled, permissionRisk: scheduling.permissionRisk },
    });
    onOpenChange(false);
  };

  const generalSections = SECTIONS.filter((s) => s.group === 'general');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col overflow-hidden p-3 sm:p-4 gap-3 sm:gap-4 max-w-[calc(100vw-0.5rem)] sm:max-w-[860px] h-[85dvh] sm:h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Workspace Settings</DialogTitle>
          <DialogDescription>
            Manage workspace configuration: MCP servers, permissions, paths, and capabilities
          </DialogDescription>
        </DialogHeader>

        {/* Mobile: Select dropdown */}
        <Select
          value={section}
          onValueChange={(v) => setSection(v as Section)}
        >
          <SelectTrigger className="sm:hidden w-full shrink-0" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_general_group" disabled className="text-xs font-semibold text-muted-foreground">General</SelectItem>
            {generalSections.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                <s.icon className="size-4" />
                {s.label}
              </SelectItem>
            ))}
            <SelectItem value="_cap_group" disabled className="text-xs font-semibold text-muted-foreground">Capabilities</SelectItem>
            {CAPABILITY_SECTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                <s.icon className="size-4" />
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs
          value={section}
          onValueChange={(v) => setSection(v as Section)}
          orientation="vertical"
          className="mt-2 flex-1 min-h-0"
        >
          {/* Desktop sidebar */}
          <TabsList className="hidden sm:flex flex-col h-fit w-44 lg:w-48 shrink-0 items-stretch gap-0.5 bg-transparent p-1 rounded-lg">
            <span className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">General</span>
            {generalSections.map((s) => (
              <TabsTrigger
                key={s.value}
                value={s.value}
                className="justify-start px-3 py-1.5 text-sm"
              >
                <s.icon className="size-4" data-icon="inline-start" />
                <span>{s.label}</span>
              </TabsTrigger>
            ))}
            <span className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Capabilities</span>
            {CAPABILITY_SECTIONS.map((s) => (
              <TabsTrigger
                key={s.value}
                value={s.value}
                className="justify-start px-3 py-1.5 text-sm"
              >
                <s.icon className="size-4" data-icon="inline-start" />
                <span>{s.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Shared content area */}
          <div className="dialog-scrollbar flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain rounded-lg border">
            <TabsContent value="mcp" className="mt-0">
              <MCPServersPanel workspaceId={workspace.id} sdkClient={sdkClient} />
            </TabsContent>
            <TabsContent value="permissions" className="mt-0">
              <PermissionsPanel
                permissions={permissions}
                onRefreshPermissions={onRefreshPermissions}
                onRevokePermission={onRevokePermission}
                onRevokeAllPermissions={onRevokeAllPermissions}
              />
            </TabsContent>
            <TabsContent value="paths" className="mt-0">
              <AdditionalPathsPanel
                workspace={workspace}
                onSave={onUpdateWorkspacePaths}
                sdkClient={sdkClient}
              />
            </TabsContent>
            <TabsContent value="memory" className="mt-0">
              <MemoryPanel
                enabled={memory.enabled}
                permissionRisk={memory.permissionRisk}
                onChange={setMemory}
              />
            </TabsContent>
            <TabsContent value="skills" className="mt-0">
              <SkillsPanel
                enabled={skills.enabled}
                permissionRisk={skills.permissionRisk}
                onChange={setSkills}
              />
            </TabsContent>
            <TabsContent value="search" className="mt-0">
              <SessionSearchPanel
                enabled={search.enabled}
                permissionRisk={search.permissionRisk}
                includeToolResults={search.includeToolResults}
                onChange={setSearch}
              />
            </TabsContent>
            <TabsContent value="workflow" className="mt-0">
              <WorkflowPanel
                enabled={workflow}
                onChange={setWorkflow}
              />
            </TabsContent>
            <TabsContent value="scheduling" className="mt-0">
              <SchedulingPanel
                enabled={scheduling.enabled}
                permissionRisk={scheduling.permissionRisk}
                onChange={setScheduling}
              />
            </TabsContent>
          </div>
        </Tabs>

        {/* Only show Save/Cancel footer for capability sections (they have a form) */}
        {isCapability && (
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
