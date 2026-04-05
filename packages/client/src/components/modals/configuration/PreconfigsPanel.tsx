import { useState, useEffect, useCallback } from 'react';
import { buildApiUrl } from '@/config/urls';
import { Layers, Plus, Pencil, Trash2, ArrowLeft, Loader2, Star, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useApi } from '@/hooks/useApi';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';

interface PanelProps {
  serverUrl: string | null;
  apiToken: string | null;
}

interface Preconfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[] | null;
  model: string | null;
  provider: string | null;
  variant?: string | null;
  settings: Record<string, unknown> | null;
  isDefault: boolean;
  mode?: 'primary' | 'subagent' | 'both';
  canSpawnSubagents?: boolean | string[] | null;
  skills?: string[] | null;
}

const MODE_OPTIONS = [
  { value: 'primary', label: 'Primary' },
  { value: 'subagent', label: 'Subagent' },
  { value: 'both', label: 'Both' },
];

interface PreconfigForm {
  name: string;
  description: string;
  systemPrompt: string;
  mode: 'primary' | 'subagent' | 'both';
  model: string;
  provider: string;
  variant: string;
  tools: string[];
  settings: string;
  canSpawnSubagentsMode: 'all' | 'none' | 'specific';
  canSpawnSubagentsList: string[];
  skills: string[];
  isDefault: boolean;
}

const emptyForm: PreconfigForm = {
  name: '',
  description: '',
  systemPrompt: '',
  mode: 'primary' as const,
  model: '',
  provider: '',
  variant: '',
  tools: [],
  settings: '',
  canSpawnSubagentsMode: 'none',
  canSpawnSubagentsList: [],
  skills: [],
  isDefault: false,
};

export function PreconfigsPanel({ serverUrl, apiToken }: PanelProps) {
  const { fetchWithAuth } = useApi();
  const apiUrl = serverUrl ? buildApiUrl(serverUrl, '') : '';

  const [preconfigs, setPreconfigs] = useState<Preconfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingPreconfig, setEditingPreconfig] = useState<Preconfig | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [_deleting, setDeleting] = useState(false);
  const [availableTools, setAvailableTools] = useState<{ name: string; description: string }[]>([]);
  const [customToolInput, setCustomToolInput] = useState('');
  const [subagentInput, setSubagentInput] = useState('');
  const [skillInput, setSkillInput] = useState('');

  const loadPreconfigs = useCallback(async () => {
    if (!apiToken || !apiUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${apiUrl}/api/preconfigs`, {
        headers: { 'Authorization': `Bearer ${apiToken}` },
      });
      if (!res.ok) throw new Error('Failed to load preconfigs');
      const data = await res.json();
      setPreconfigs(data.preconfigs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preconfigs');
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, apiUrl, apiToken]);

  useEffect(() => {
    loadPreconfigs();
  }, [loadPreconfigs]);

  useEffect(() => {
    if (!apiToken || !apiUrl) return;
    fetchWithAuth(`${apiUrl}/api/tools`, {
      headers: { 'Authorization': `Bearer ${apiToken}` },
    })
      .then(res => res.json())
      .then(data => setAvailableTools(data.tools || []))
      .catch(() => {});
  }, [fetchWithAuth, apiUrl, apiToken]);

  const handleCreate = () => {
    setIsCreating(true);
    setEditingPreconfig(null);
    setForm(emptyForm);
    setCustomToolInput('');
    setSubagentInput('');
    setSkillInput('');
  };

  const handleEdit = (preconfig: Preconfig) => {
    setEditingPreconfig(preconfig);
    setIsCreating(false);
    setForm({
      name: preconfig.name,
      description: preconfig.description || '',
      systemPrompt: preconfig.systemPrompt || '',
      mode: preconfig.mode || 'primary',
      model: preconfig.model || '',
      provider: preconfig.provider || '',
      variant: preconfig.variant || '',
      tools: preconfig.tools ?? [],
      settings: preconfig.settings ? JSON.stringify(preconfig.settings, null, 2) : '',
      canSpawnSubagentsMode: preconfig.canSpawnSubagents === true ? 'all'
        : preconfig.canSpawnSubagents === false || preconfig.canSpawnSubagents === null || preconfig.canSpawnSubagents === undefined
          ? 'none'
          : 'specific',
      canSpawnSubagentsList: Array.isArray(preconfig.canSpawnSubagents) ? preconfig.canSpawnSubagents : [],
      skills: preconfig.skills ?? [],
      isDefault: preconfig.isDefault,
    });
    setCustomToolInput('');
    setSubagentInput('');
    setSkillInput('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Parse settings JSON
      let settings: Record<string, unknown> | null = null;
      if (form.settings.trim()) {
        try {
          const parsed = JSON.parse(form.settings);
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            settings = parsed;
          } else {
            throw new Error('Settings must be a JSON object');
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Invalid settings JSON');
          setSaving(false);
          return;
        }
      }

      // Derive canSpawnSubagents
      let canSpawnSubagents: boolean | string[] | null = null;
      if (form.canSpawnSubagentsMode === 'all') {
        canSpawnSubagents = true;
      } else if (form.canSpawnSubagentsMode === 'specific') {
        canSpawnSubagents = form.canSpawnSubagentsList.length > 0 ? form.canSpawnSubagentsList : [];
      } else {
        canSpawnSubagents = false;
      }

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim(),
        systemPrompt: form.systemPrompt,
        mode: form.mode,
        model: form.model.trim() || null,
        provider: form.provider.trim() || null,
        variant: form.variant.trim() || null,
        tools: form.tools.length > 0 ? form.tools : null,
        settings,
        canSpawnSubagents,
        skills: form.skills.length > 0 ? form.skills : null,
        isDefault: form.isDefault,
        format: 'md',
      };

      if (isCreating) {
        const res = await fetchWithAuth(`${apiUrl}/api/preconfigs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to create preconfig');
        }
      } else if (editingPreconfig) {
        const res = await fetchWithAuth(`${apiUrl}/api/preconfigs/${editingPreconfig.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to update preconfig');
        }
      }
      setIsCreating(false);
      setEditingPreconfig(null);
      await loadPreconfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preconfig');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`${apiUrl}/api/preconfigs/${deleteTarget}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to delete preconfig');
      }
      setDeleteTarget(null);
      await loadPreconfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preconfig');
    } finally {
      setDeleting(false);
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingPreconfig(null);
    setForm(emptyForm);
    setCustomToolInput('');
    setSubagentInput('');
    setSkillInput('');
  };

  if (isCreating || editingPreconfig) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleCancel}>
              <ArrowLeft className="size-4" />
            </Button>
            <h3 className="text-sm font-medium">
              {isCreating ? 'New Preconfig' : `Edit: ${editingPreconfig?.name}`}
            </h3>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
          </Button>
        </div>

        {error && (
          <div className="p-2 rounded bg-destructive/10 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-sm">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Agent"
            />
          </div>
          <div>
            <Label className="text-sm">Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description..."
            />
          </div>
          <div>
            <Label className="text-sm">Mode</Label>
            <select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value as 'primary' | 'subagent' | 'both' })}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            >
              {MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Model (optional)</Label>
              <Input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="gpt-4o"
                className="font-mono"
              />
            </div>
            <div>
              <Label className="text-sm">Provider (optional)</Label>
              <Input
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                placeholder="openai"
                className="font-mono"
              />
            </div>
          </div>

          <Separator className="my-1" />

          <div>
            <Label className="text-sm">Variant (optional)</Label>
            <Input
              value={form.variant}
              onChange={(e) => setForm({ ...form, variant: e.target.value })}
              placeholder="e.g., low, medium, high"
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Model variant key from models.json</p>
          </div>

          <Separator className="my-1" />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Default Preconfig</Label>
              <p className="text-[10px] text-muted-foreground">Only one preconfig can be the default</p>
            </div>
            <Switch
              checked={form.isDefault}
              onCheckedChange={(checked) => setForm({ ...form, isDefault: checked })}
            />
          </div>

          <Separator className="my-1" />

          <div className="space-y-2">
            <Label className="text-sm">Tools</Label>
            <p className="text-[10px] text-muted-foreground">
              {form.tools.length === 0 ? 'No tools selected — all available tools will be enabled' : `${form.tools.length} tool${form.tools.length !== 1 ? 's' : ''} selected`}
            </p>

            {availableTools.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {availableTools.map(tool => {
                  const selected = form.tools.includes(tool.name);
                  return (
                    <button
                      key={tool.name}
                      type="button"
                      onClick={() => {
                        setForm(prev => ({
                          ...prev,
                          tools: selected
                            ? prev.tools.filter(t => t !== tool.name)
                            : [...prev.tools, tool.name],
                        }));
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border transition-colors ${
                        selected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:bg-muted'
                      }`}
                      title={tool.description}
                    >
                      {selected && <Check className="size-2.5" />}
                      {tool.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-1.5">
              <Input
                value={customToolInput}
                onChange={(e) => setCustomToolInput(e.target.value)}
                placeholder="Add custom tool ID..."
                className="h-7 text-xs font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customToolInput.trim()) {
                    e.preventDefault();
                    const id = customToolInput.trim();
                    if (!form.tools.includes(id)) {
                      setForm(prev => ({ ...prev, tools: [...prev.tools, id] }));
                    }
                    setCustomToolInput('');
                  }
                }}
              />
            </div>

            {form.tools.filter(t => !availableTools.some(at => at.name === t)).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.tools.filter(t => !availableTools.some(at => at.name === t)).map(tool => (
                  <span
                    key={tool}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-primary/10 border border-primary/30"
                  >
                    {tool}
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, tools: prev.tools.filter(t => t !== tool) }))}
                      className="hover:text-destructive"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <Separator className="my-1" />

          <div className="space-y-1">
            <Label className="text-sm">Settings</Label>
            <p className="text-[10px] text-muted-foreground">JSON object for model parameters (e.g., temperature)</p>
            <textarea
              value={form.settings}
              onChange={(e) => setForm({ ...form, settings: e.target.value })}
              className="w-full h-20 p-2 rounded-lg border bg-background text-sm font-mono resize-y"
              placeholder='{"temperature": 0.2}'
            />
          </div>

          <Separator className="my-1" />

          <div className="space-y-2">
            <Label className="text-sm">Can Spawn Subagents</Label>
            <select
              value={form.canSpawnSubagentsMode}
              onChange={(e) => setForm({ ...form, canSpawnSubagentsMode: e.target.value as 'all' | 'none' | 'specific' })}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="none">No — cannot spawn subagents</option>
              <option value="all">Yes — all available subagents</option>
              <option value="specific">Specific — choose which subagents</option>
            </select>

            {form.canSpawnSubagentsMode === 'specific' && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground">Enter preconfig IDs that this agent can spawn</p>
                <div className="flex gap-1.5">
                  <Input
                    value={subagentInput}
                    onChange={(e) => setSubagentInput(e.target.value)}
                    placeholder="Preconfig ID..."
                    className="h-7 text-xs font-mono"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && subagentInput.trim()) {
                        e.preventDefault();
                        const id = subagentInput.trim();
                        if (!form.canSpawnSubagentsList.includes(id)) {
                          setForm(prev => ({ ...prev, canSpawnSubagentsList: [...prev.canSpawnSubagentsList, id] }));
                        }
                        setSubagentInput('');
                      }
                    }}
                  />
                </div>
                {form.canSpawnSubagentsList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.canSpawnSubagentsList.map(id => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-primary/10 border border-primary/30 font-mono"
                      >
                        {id}
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({
                            ...prev,
                            canSpawnSubagentsList: prev.canSpawnSubagentsList.filter(s => s !== id),
                          }))}
                          className="hover:text-destructive"
                        >
                          <X className="size-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator className="my-1" />

          <div className="space-y-2">
            <Label className="text-sm">Skills</Label>
            <p className="text-[10px] text-muted-foreground">
              {form.skills.length === 0 ? 'No skills selected — all available skills will be enabled' : `${form.skills.length} skill${form.skills.length !== 1 ? 's' : ''} selected`}
            </p>
            <div className="flex gap-1.5">
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                placeholder="Skill name..."
                className="h-7 text-xs font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && skillInput.trim()) {
                    e.preventDefault();
                    const name = skillInput.trim();
                    if (!form.skills.includes(name)) {
                      setForm(prev => ({ ...prev, skills: [...prev.skills, name] }));
                    }
                    setSkillInput('');
                  }
                }}
              />
            </div>
            {form.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.skills.map(skill => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-primary/10 border border-primary/30"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }))}
                      className="hover:text-destructive"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <Separator className="my-1" />

          <div>
            <Label className="text-sm">System Prompt</Label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              className="w-full h-48 p-3 rounded-lg border bg-background text-sm resize-y"
              placeholder="System prompt content..."
            />
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {preconfigs.length} preconfig{preconfigs.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="size-3" />
          <span className="hidden sm:inline">New Preconfig</span>
        </Button>
      </div>

      {error && (
        <div className="p-2 rounded bg-destructive/10 text-sm text-destructive">{error}</div>
      )}

      {preconfigs.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No preconfigs yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {preconfigs.map((preconfig) => (
            <div
              key={preconfig.id}
              className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
              onClick={() => handleEdit(preconfig)}
            >
              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <Layers className="size-4 text-muted-foreground shrink-0 hidden sm:block" />
                <div className="flex flex-col flex-1 min-w-0 gap-0.5 sm:gap-1 overflow-hidden">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{preconfig.name}</span>
                    {preconfig.isDefault && (
                      <Badge variant="default" className="text-[10px] px-1 sm:px-1.5 py-0">
                        <Star className="size-2.5 sm:mr-0.5" />
                        <span className="hidden sm:inline">Default</span>
                      </Badge>
                    )}
                    {preconfig.mode && preconfig.mode !== 'primary' && (
                      <Badge variant="secondary" className="text-[10px] px-1 sm:px-1.5 py-0">
                        <span className="hidden sm:inline">{preconfig.mode}</span>
                        <span className="sm:hidden">{preconfig.mode === 'subagent' ? 'SA' : 'B'}</span>
                      </Badge>
                    )}
                  </div>
                  {preconfig.description && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{preconfig.description}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 sm:gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => handleEdit(preconfig)}
                  title="Edit preconfig"
                >
                  <Pencil className="size-3" />
                </Button>
                {!preconfig.isDefault && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setDeleteTarget(preconfig.id)}
                    title="Delete preconfig"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Preconfig"
        description="Are you sure you want to delete this preconfig? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
