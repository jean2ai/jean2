import { useState, useEffect } from 'react';
import { Brain, Wrench, Search, Workflow } from 'lucide-react';
import type { Workspace, WorkspaceSettings, PermissionRiskLevel } from '@jean2/sdk';
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

type WorkspaceSettingsSection = 'memory' | 'skills' | 'search' | 'workflow';

interface SectionDef {
  value: WorkspaceSettingsSection;
  label: string;
  icon: typeof Brain;
}

const SECTIONS: SectionDef[] = [
  { value: 'memory', label: 'Memory', icon: Brain },
  { value: 'skills', label: 'Skills', icon: Wrench },
  { value: 'search', label: 'Session Search', icon: Search },
  { value: 'workflow', label: 'Workflow', icon: Workflow },
];

interface WorkspaceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  onSave: (workspaceId: string, settings: WorkspaceSettings) => void;
}

export function WorkspaceSettingsDialog({
  open,
  onOpenChange,
  workspace,
  onSave,
}: WorkspaceSettingsDialogProps) {
  const [section, setSection] = useState<WorkspaceSettingsSection>('memory');

  // Local state for all 4 capability settings
  const [memory, setMemory] = useState({ enabled: false, permissionRisk: 'medium' as PermissionRiskLevel });
  const [skills, setSkills] = useState({ enabled: false, permissionRisk: 'medium' as PermissionRiskLevel });
  const [search, setSearch] = useState({ enabled: false, permissionRisk: 'medium' as PermissionRiskLevel, includeToolResults: false });
  const [workflow, setWorkflow] = useState(false);

  // Load from workspace when dialog opens
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
    }
  }, [open, workspace.settings]);

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
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col overflow-hidden p-3 sm:p-4 gap-3 sm:gap-4 max-w-[calc(100vw-0.5rem)] sm:max-w-[860px] h-[85dvh] sm:h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Workspace Settings</DialogTitle>
          <DialogDescription>
            Manage workspace capabilities: memory, skills, session search, and workflow
          </DialogDescription>
        </DialogHeader>

        {/* Mobile: Select dropdown */}
        <Select
          value={section}
          onValueChange={(v) => setSection(v as WorkspaceSettingsSection)}
        >
          <SelectTrigger className="sm:hidden w-full shrink-0" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                <s.icon className="size-4" />
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs
          value={section}
          onValueChange={(v) => setSection(v as WorkspaceSettingsSection)}
          orientation="vertical"
          className="mt-2 flex-1 min-h-0"
        >
          {/* Desktop sidebar */}
          <TabsList className="hidden sm:flex flex-col h-fit w-44 lg:w-48 shrink-0 items-stretch gap-0.5 bg-transparent p-1 rounded-lg">
            {SECTIONS.map((s) => (
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
          </div>
        </Tabs>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
