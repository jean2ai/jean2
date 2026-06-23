import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface WorkflowPanelProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function WorkflowPanel({ enabled, onChange }: WorkflowPanelProps) {
  return (
    <div className="p-3 sm:p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="workflow-enabled">Enable Workflow</Label>
          <p className="text-xs text-muted-foreground">
            When enabled, the agent can use the workflow tool to fan out work to parallel subagents.
          </p>
        </div>
        <Switch
          id="workflow-enabled"
          checked={enabled}
          onCheckedChange={onChange}
        />
      </div>
    </div>
  );
}
