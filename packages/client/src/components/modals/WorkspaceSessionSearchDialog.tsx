import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
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
  { value: 'none', label: 'None', description: 'Auto-approve all searches' },
  { value: 'low', label: 'Low', description: 'Only ask for workspace-wide searches' },
  { value: 'medium', label: 'Medium', description: 'Ask for each search' },
  { value: 'high', label: 'High', description: 'Require explicit approval' },
  { value: 'critical', label: 'Critical', description: 'Always confirm with details' },
];

interface WorkspaceSessionSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  onSave: (workspaceId: string, settings: WorkspaceSettings) => void;
}

export function WorkspaceSessionSearchDialog({
  open,
  onOpenChange,
  workspace,
  onSave,
}: WorkspaceSessionSearchDialogProps) {
  const [enabled, setEnabled] = useState(false);
  const [permissionRisk, setPermissionRisk] = useState<PermissionRiskLevel>('medium');
  const [includeToolResults, setIncludeToolResults] = useState(false);

  useEffect(() => {
    if (open) {
      const search = workspace.settings?.sessionSearch;
      setEnabled(search?.enabled ?? false);
      setPermissionRisk(search?.permissionRisk ?? 'medium');
      setIncludeToolResults(search?.includeToolResults ?? false);
    }
  }, [open, workspace.settings]);

  const handleSave = () => {
    onSave(workspace.id, {
      ...workspace.settings,
      sessionSearch: { enabled, permissionRisk, includeToolResults },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Session / Archive Search
          </DialogTitle>
          <DialogDescription>
            Enable the agent to search prior conversation messages from this workspace. The agent can recall past work, find earlier discussions, and retrieve compacted details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="search-enabled">Enable session search</Label>
              <p className="text-xs text-muted-foreground">
                Expose the session_search tool for workspace-scoped message recall
              </p>
            </div>
            <Switch
              id="search-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {enabled && (
            <>
              <div className="space-y-3">
                <Label>Permission level for searches</Label>
                <p className="text-xs text-muted-foreground">
                  Controls when the agent needs approval to search sessions
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

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="include-tool-results">Include tool results by default</Label>
                  <p className="text-xs text-muted-foreground">
                    Search tool output alongside user/assistant messages
                  </p>
                </div>
                <Switch
                  id="include-tool-results"
                  checked={includeToolResults}
                  onCheckedChange={setIncludeToolResults}
                />
              </div>
            </>
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
