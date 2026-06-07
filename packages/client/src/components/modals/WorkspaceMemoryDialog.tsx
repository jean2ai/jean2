import { useState, useEffect } from 'react';
import { Brain } from 'lucide-react';
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

interface WorkspaceMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  onSave: (workspaceId: string, settings: WorkspaceSettings) => void;
}

export function WorkspaceMemoryDialog({
  open,
  onOpenChange,
  workspace,
  onSave,
}: WorkspaceMemoryDialogProps) {
  const [enabled, setEnabled] = useState(false);
  const [permissionRisk, setPermissionRisk] = useState<PermissionRiskLevel>('medium');

  useEffect(() => {
    if (open) {
      const mem = workspace.settings?.memory;
      setEnabled(mem?.enabled ?? false);
      setPermissionRisk(mem?.permissionRisk ?? 'medium');
    }
  }, [open, workspace.settings]);

  const handleSave = () => {
    onSave(workspace.id, {
      ...workspace.settings,
      memory: { enabled, permissionRisk },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Memory
          </DialogTitle>
          <DialogDescription>
            Enable workspace memory to persist facts across sessions. The agent can save user preferences and workspace knowledge to memory files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="memory-enabled">Enable memory</Label>
              <p className="text-xs text-muted-foreground">
                Load memory into context and expose the memory tool
              </p>
            </div>
            <Switch
              id="memory-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {enabled && (
            <div className="space-y-3">
              <Label>Permission level for writes</Label>
              <p className="text-xs text-muted-foreground">
                Controls when the agent needs approval to save to memory
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
