import { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import type { Workspace, PermissionRiskLevel, WorkspaceSettings } from '@jean2/sdk';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const RISK_OPTIONS: { value: PermissionRiskLevel; label: string; description: string }[] = [
  { value: 'none', label: 'None', description: 'Auto-approve all writes' },
  { value: 'low', label: 'Low', description: 'Only ask for bulk changes' },
  { value: 'medium', label: 'Medium', description: 'Ask for each write' },
  { value: 'high', label: 'High', description: 'Require explicit approval' },
  { value: 'critical', label: 'Critical', description: 'Always confirm with details' },
];

interface WorkspaceSkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  onSave: (workspaceId: string, settings: WorkspaceSettings) => void;
}

export function WorkspaceSkillsDialog({
  open,
  onOpenChange,
  workspace,
  onSave,
}: WorkspaceSkillsDialogProps) {
  const [managementEnabled, setManagementEnabled] = useState(false);
  const [permissionRisk, setPermissionRisk] = useState<PermissionRiskLevel>('medium');

  useEffect(() => {
    if (open) {
      const skills = workspace.settings?.skills;
      setManagementEnabled(skills?.managementEnabled ?? false);
      setPermissionRisk(skills?.permissionRisk ?? 'medium');
    }
  }, [open, workspace.settings]);

  const handleSave = () => {
    onSave(workspace.id, {
      ...workspace.settings,
      skills: { managementEnabled, permissionRisk },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Skill Management
          </DialogTitle>
          <DialogDescription>
            Enable the agent to create, update, and delete reusable workspace skills. Skills are procedural workflows stored under .agents/skills/.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="skills-enabled">Enable skill management</Label>
              <p className="text-xs text-muted-foreground">
                Expose the skill_manage tool so the agent can manage workspace skills
              </p>
            </div>
            <Switch
              id="skills-enabled"
              checked={managementEnabled}
              onCheckedChange={setManagementEnabled}
            />
          </div>

          {managementEnabled && (
            <div className="space-y-3">
              <Label>Permission level for writes</Label>
              <p className="text-xs text-muted-foreground">
                Controls when the agent needs approval to modify skills
              </p>
              <div className="grid gap-2">
                {RISK_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPermissionRisk(option.value)}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      permissionRisk === option.value
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs">{option.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
