import { useState, useEffect, useCallback } from 'react';
import type { HttpClient } from '@jean2/sdk';
import type { ModelRuntimeStatus, ModelWithStatus } from '@jean2/sdk';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  Loader2,
  Check,
  X,
  Boxes,
  Star,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';

interface PanelProps {
  httpClient: HttpClient | null;
}

interface ProviderConfig {
  id: string;
  name: string;
  models: ModelWithStatus[];
}

interface ModelsConfigResponse {
  providers: ProviderConfig[];
  defaultModel: string;
  defaultProvider: string;
}

type Tier = 'budget' | 'standard' | 'premium';

function TierBadge({ tier }: { tier: Tier }) {
  const variants: Record<Tier, { variant: 'secondary' | 'default' | 'outline'; icon: React.ReactNode }> = {
    budget: { variant: 'secondary', icon: <span className="text-[10px] font-bold">B</span> },
    standard: { variant: 'default', icon: <span className="text-[10px] font-bold">S</span> },
    premium: { variant: 'outline', icon: <Star className="size-2.5" /> },
  };
  const { variant, icon } = variants[tier];
  return (
    <Badge variant={variant} className="text-[10px] gap-0.5">
      {icon}
      <span className="hidden sm:inline">{tier}</span>
    </Badge>
  );
}

function StatusBadge({ status }: { status: ModelRuntimeStatus }) {
  if (status.usable) {
    return (
      <Badge variant="default" className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
        <Check className="size-2.5" />
        <span className="hidden sm:inline">Usable</span>
      </Badge>
    );
  }
  if (status.providerSupported && !status.providerConfigured) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        <AlertCircle className="size-2.5" />
        <span className="hidden sm:inline">Needs config</span>
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      <X className="size-2.5" />
      <span className="hidden sm:inline">Unsupported</span>
    </Badge>
  );
}

interface ProviderFormData {
  id: string;
  name: string;
}

interface ModelFormData {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  tier: Tier;
  variants?: Record<string, { providerOptions: Record<string, unknown> }>;
  capabilities?: { input?: { text?: boolean; image?: boolean; video?: boolean; file?: string[] } };
}

const emptyProviderForm: ProviderFormData = { id: '', name: '' };
const emptyModelForm: ModelFormData = { id: '', name: '', contextWindow: 128000, maxOutputTokens: undefined, tier: 'standard' as Tier };

export function ModelsPanel({ httpClient }: PanelProps) {
  const [config, setConfig] = useState<ModelsConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [isCreatingProvider, setIsCreatingProvider] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderFormData>(emptyProviderForm);
  const [savingProvider, setSavingProvider] = useState(false);
  const [deleteProviderTarget, setDeleteProviderTarget] = useState<string | null>(null);
  const [_deletingProvider, setDeletingProvider] = useState(false);

  const [editingModel, setEditingModel] = useState<{ providerId: string; modelId: string } | null>(null);
  const [isCreatingModel, setIsCreatingModel] = useState<string | null>(null);
  const [modelForm, setModelForm] = useState<ModelFormData>(emptyModelForm);
  const [savingModel, setSavingModel] = useState(false);
  const [deleteModelTarget, setDeleteModelTarget] = useState<{ providerId: string; modelId: string } | null>(null);
  const [_deletingModel, setDeletingModel] = useState(false);
  const [variantJsonErrors, setVariantJsonErrors] = useState<Record<string, boolean>>({});

  const [isEditingDefaults, setIsEditingDefaults] = useState(false);
  const [defaultsForm, setDefaultsForm] = useState({ defaultProvider: '', defaultModel: '' });
  const [savingDefaults, setSavingDefaults] = useState(false);

  function updateCapabilities(
    form: ModelFormData,
    field: 'text' | 'image' | 'video',
    value: boolean
  ): ModelFormData {
    const input = { ...(form.capabilities?.input) };
    input[field] = value;
    const hasCapabilities = input.text || input.image || input.video || (Array.isArray(input.file) && input.file.length > 0);
    return {
      ...form,
      capabilities: hasCapabilities ? { input } : undefined,
    };
  }

  function updateFileTypes(form: ModelFormData, raw: string): ModelFormData {
    const file = raw.trim() ? raw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const input = { ...form.capabilities?.input, file };
    const hasCapabilities = input.text || input.image || input.video || (Array.isArray(input.file) && input.file.length > 0);
    return {
      ...form,
      capabilities: hasCapabilities ? { input } : undefined,
    };
  }

  const addVariant = () => {
    const variants = { ...(modelForm.variants || {}) };
    let key = 'new';
    let i = 1;
    while (variants[key]) {
      key = `new-${i++}`;
    }
    variants[key] = { providerOptions: {} };
    setModelForm(prev => ({ ...prev, variants }));
  };

  const removeVariant = (key: string) => {
    const variants = { ...(modelForm.variants || {}) };
    delete variants[key];
    const remaining = Object.keys(variants);
    setModelForm(prev => ({
      ...prev,
      variants: remaining.length > 0 ? variants : undefined,
    }));
  };

  const renameVariant = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const variants = { ...(modelForm.variants || {}) };
    if (variants[newKey] && newKey !== oldKey) return;
    const entry = variants[oldKey];
    delete variants[oldKey];
    variants[newKey] = entry;
    setModelForm(prev => ({ ...prev, variants: Object.keys(variants).length > 0 ? variants : undefined }));
  };

  const updateVariantJson = (key: string, raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setVariantJsonErrors(prev => ({ ...prev, [key]: true }));
        return;
      }
      const variants = { ...(modelForm.variants || {}) };
      variants[key] = { providerOptions: parsed };
      setModelForm(prev => ({ ...prev, variants }));
      setVariantJsonErrors(prev => ({ ...prev, [key]: false }));
    } catch {
      setVariantJsonErrors(prev => ({ ...prev, [key]: true }));
    }
  };
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());

  const loadConfig = useCallback(async () => {
    if (!httpClient) return;
    setLoading(true);
    setError(null);
    try {
      const data = await httpClient.get<ModelsConfigResponse>('/config/models');
      setConfig(data);
      setDefaultsForm({ defaultProvider: data.defaultProvider, defaultModel: data.defaultModel });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models config');
    } finally {
      setLoading(false);
    }
  }, [httpClient]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleCreateProvider = () => {
    setIsCreatingProvider(true);
    setEditingProvider(null);
    setProviderForm(emptyProviderForm);
  };

  const handleEditProvider = (provider: ProviderConfig) => {
    setEditingProvider(provider.id);
    setIsCreatingProvider(false);
    setProviderForm({ id: provider.id, name: provider.name });
  };

  const handleSaveProvider = async () => {
    if (!providerForm.id.trim() || !providerForm.name.trim()) return;
    setSavingProvider(true);
    setError(null);
    try {
      const body = isCreatingProvider
        ? { id: providerForm.id.trim(), name: providerForm.name.trim() }
        : { name: providerForm.name.trim() };

      if (isCreatingProvider) {
        await httpClient!.post('/config/models/providers', body);
      } else {
        await httpClient!.put(`/config/models/providers/${editingProvider}`, body);
      }
      setIsCreatingProvider(false);
      setEditingProvider(null);
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleDeleteProvider = async () => {
    if (!deleteProviderTarget) return;
    setDeletingProvider(true);
    setError(null);
    try {
      await httpClient!.delete(`/config/models/providers/${deleteProviderTarget}`);
      setDeleteProviderTarget(null);
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete provider');
    } finally {
      setDeletingProvider(false);
    }
  };

  const handleCreateModel = (providerId: string) => {
    setIsCreatingModel(providerId);
    setEditingModel(null);
    setModelForm(emptyModelForm);
    setVariantJsonErrors({});
  };

  const handleEditModel = (model: ModelWithStatus) => {
    setEditingModel({ providerId: model.providerId, modelId: model.id });
    setIsCreatingModel(null);
    setModelForm({
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxOutputTokens,
      tier: model.tier,
      variants: model.variants,
      capabilities: model.capabilities,
    });
    setVariantJsonErrors({});
  };

  const handleSaveModel = async (providerId: string) => {
    if (!modelForm.id.trim() || !modelForm.name.trim()) return;
    setSavingModel(true);
    setError(null);
    try {
      const body = {
        ...(isCreatingModel ? { id: modelForm.id.trim() } : {}),
        name: modelForm.name.trim(),
        contextWindow: modelForm.contextWindow,
        maxOutputTokens: modelForm.maxOutputTokens,
        tier: modelForm.tier,
        variants: modelForm.variants,
        capabilities: modelForm.capabilities,
      };

      if (isCreatingModel) {
        await httpClient!.post(`/config/models/providers/${providerId}/models`, body);
      } else {
        await httpClient!.put(`/config/models/providers/${providerId}/models/${editingModel?.modelId}`, body);
      }
      setIsCreatingModel(null);
      setEditingModel(null);
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save model');
    } finally {
      setSavingModel(false);
    }
  };

  const handleDeleteModel = async () => {
    if (!deleteModelTarget) return;
    setDeletingModel(true);
    setError(null);
    try {
      await httpClient!.delete(`/config/models/providers/${deleteModelTarget.providerId}/models/${deleteModelTarget.modelId}`);
      setDeleteModelTarget(null);
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete model');
    } finally {
      setDeletingModel(false);
    }
  };

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    setError(null);
    try {
      await httpClient!.put('/config/models/defaults', {
        defaultProvider: defaultsForm.defaultProvider,
        defaultModel: defaultsForm.defaultModel,
      });
      setIsEditingDefaults(false);
      await loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save defaults');
    } finally {
      setSavingDefaults(false);
    }
  };

  const toggleProviderCollapse = (providerId: string) => {
    setCollapsedProviders(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const allModels: { providerId: string; providerName: string; modelId: string; modelName: string }[] = [];
  config?.providers.forEach(provider => {
    provider.models.forEach(model => {
      allModels.push({
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        modelName: model.name,
      });
    });
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isCreatingProvider || editingProvider) {
    const editing = config?.providers.find(p => p.id === editingProvider);
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {isCreatingProvider ? 'New Provider' : `Edit: ${editing?.name || editingProvider}`}
          </h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSaveProvider}
              disabled={savingProvider || !providerForm.id.trim() || !providerForm.name.trim()}
            >
              {savingProvider ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsCreatingProvider(false);
                setEditingProvider(null);
              }}
            >
              <X className="size-3" />
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-2 rounded bg-destructive/10 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Provider ID</Label>
            <Input
              value={providerForm.id}
              onChange={(e) => setProviderForm(prev => ({ ...prev, id: e.target.value }))}
              disabled={!isCreatingProvider}
              placeholder="e.g., openai"
              className="mt-1 font-mono"
            />
            {!isCreatingProvider && (
              <p className="text-[10px] text-muted-foreground mt-1">ID cannot be changed</p>
            )}
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={providerForm.name}
              onChange={(e) => setProviderForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., OpenAI"
              className="mt-1"
            />
          </div>
        </div>
      </div>
    );
  }

  if (isCreatingModel || editingModel) {
    const providerId = isCreatingModel || editingModel?.providerId || '';
    const provider = config?.providers.find(p => p.id === providerId);
    const existingModel = !isCreatingModel && editingModel
      ? provider?.models.find(m => m.id === editingModel.modelId)
      : null;

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {isCreatingModel ? `New Model (${provider?.name || providerId})` : `Edit: ${existingModel?.name || editingModel?.modelId}`}
          </h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleSaveModel(providerId)}
              disabled={savingModel || !modelForm.id.trim() || !modelForm.name.trim() || Object.values(variantJsonErrors).some(Boolean)}
            >
              {savingModel ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsCreatingModel(null);
                setEditingModel(null);
              }}
            >
              <X className="size-3" />
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-2 rounded bg-destructive/10 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Model ID</Label>
            <Input
              value={modelForm.id}
              onChange={(e) => setModelForm(prev => ({ ...prev, id: e.target.value }))}
              disabled={!isCreatingModel}
              placeholder="e.g., gpt-4o"
              className="mt-1 font-mono"
            />
            {!isCreatingModel && (
              <p className="text-[10px] text-muted-foreground mt-1">ID cannot be changed</p>
            )}
          </div>
          <div>
            <Label className="text-xs">Display Name</Label>
            <Input
              value={modelForm.name}
              onChange={(e) => setModelForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., GPT-4o"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Context Window</Label>
              <Input
                type="number"
                value={modelForm.contextWindow}
                onChange={(e) => setModelForm(prev => ({ ...prev, contextWindow: parseInt(e.target.value) || 0 }))}
                min={1}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Max Output Tokens</Label>
              <Input
                type="number"
                value={modelForm.maxOutputTokens ?? ''}
                onChange={(e) => setModelForm(prev => ({
                  ...prev,
                  maxOutputTokens: e.target.value ? parseInt(e.target.value) : undefined,
                }))}
                min={1}
                placeholder="Optional"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Tier</Label>
            <select
              value={modelForm.tier}
              onChange={(e) => setModelForm(prev => ({ ...prev, tier: e.target.value as Tier }))}
              className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="budget">Budget</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </div>

          <Separator className="my-2" />

          <div className="space-y-2">
            <Label className="text-xs font-medium">Capabilities</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Switch
                  checked={modelForm.capabilities?.input?.text ?? false}
                  onCheckedChange={(checked) => setModelForm(prev => updateCapabilities(prev, 'text', checked))}
                />
                <span className="text-xs">Text</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Switch
                  checked={modelForm.capabilities?.input?.image ?? false}
                  onCheckedChange={(checked) => setModelForm(prev => updateCapabilities(prev, 'image', checked))}
                />
                <span className="text-xs">Image</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Switch
                  checked={modelForm.capabilities?.input?.video ?? false}
                  onCheckedChange={(checked) => setModelForm(prev => updateCapabilities(prev, 'video', checked))}
                />
                <span className="text-xs">Video</span>
              </label>
            </div>
            <div>
              <Label className="text-xs">File Types (MIME, comma-separated)</Label>
              <Input
                value={modelForm.capabilities?.input?.file?.join(', ') ?? ''}
                onChange={(e) => setModelForm(prev => updateFileTypes(prev, e.target.value))}
                placeholder="e.g., application/pdf, text/csv"
                className="mt-1 font-mono text-xs"
              />
            </div>
          </div>

          <Separator className="my-2" />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Variants</Label>
              <Button type="button" size="sm" variant="ghost" onClick={addVariant}>
                <Plus className="size-3" />
                Add Variant
              </Button>
            </div>
            {modelForm.variants && Object.keys(modelForm.variants).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(modelForm.variants).map(([key, variant]) => (
                  <div key={key} className="border rounded p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={key}
                        onChange={(e) => renameVariant(key, e.target.value)}
                        placeholder="variant name"
                        className="h-7 text-xs font-mono w-24"
                      />
                      <div className="flex-1" />
                      <Button type="button" size="icon-xs" variant="ghost" onClick={() => removeVariant(key)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                    <Textarea
                      value={JSON.stringify(variant.providerOptions, null, 2)}
                      onChange={(e) => updateVariantJson(key, e.target.value)}
                      placeholder="{}"
                      className="font-mono text-xs min-h-[60px]"
                      rows={3}
                    />
                    {variantJsonErrors[key] && (
                      <p className="text-[10px] text-destructive">Invalid JSON</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No variants configured</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="border rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Boxes className="size-4" />
            Default Model
          </h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsEditingDefaults(!isEditingDefaults)}
          >
            {isEditingDefaults ? <X className="size-3" /> : <Pencil className="size-3" />}
          </Button>
        </div>

        {isEditingDefaults ? (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Default Provider</Label>
              <select
                value={defaultsForm.defaultProvider}
                onChange={(e) => setDefaultsForm(prev => ({ ...prev, defaultProvider: e.target.value, defaultModel: '' }))}
                className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                <option value="">Select provider...</option>
                {config?.providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Default Model</Label>
              <select
                value={defaultsForm.defaultModel}
                onChange={(e) => setDefaultsForm(prev => ({ ...prev, defaultModel: e.target.value }))}
                className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                <option value="">Select model...</option>
                {config?.providers
                  .find(p => p.id === defaultsForm.defaultProvider)
                  ?.models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setIsEditingDefaults(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveDefaults}
                disabled={savingDefaults || !defaultsForm.defaultProvider || !defaultsForm.defaultModel}
              >
                {savingDefaults ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {config?.defaultProvider && config?.defaultModel ? (
              <span>
                {config.providers.find(p => p.id === config.defaultProvider)?.name || config.defaultProvider} /{' '}
                {config.providers.find(p => p.id === config.defaultProvider)?.models.find(m => m.id === config.defaultModel)?.name || config.defaultModel}
              </span>
            ) : (
              <span className="italic">Not configured</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-2 rounded bg-destructive/10 text-sm text-destructive">{error}</div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {config?.providers.length || 0} provider{(config?.providers.length || 0) !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={handleCreateProvider}>
          <Plus className="size-3" />
          <span className="hidden sm:inline">Add Provider</span>
        </Button>
      </div>

      {config?.providers.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No providers configured. Add one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {config?.providers.map((provider) => {
            const isCollapsed = collapsedProviders.has(provider.id);
            const isCurrentDefaultProvider = provider.id === config.defaultProvider;

            return (
              <Collapsible
                key={provider.id}
                open={!isCollapsed}
                onOpenChange={() => toggleProviderCollapse(provider.id)}
                className="border rounded-lg"
              >
                <div
                  className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => toggleProviderCollapse(provider.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight className={`size-4 transition-transform ${!isCollapsed ? 'rotate-90' : ''}`} />
                    <span className="text-sm font-medium truncate">{provider.name}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
                    </Badge>
                    {isCurrentDefaultProvider && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleCreateModel(provider.id)}
                      title="Add model"
                    >
                      <Plus className="size-3" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleEditProvider(provider)}
                      title="Edit provider"
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => setDeleteProviderTarget(provider.id)}
                      title="Delete provider"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>

                <CollapsibleContent>
                  <div className="border-t px-3 py-2 space-y-1 bg-muted/30">
                    {provider.models.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-2 pl-6">
                        No models. Add one to get started.
                      </div>
                    ) : (
                      provider.models.map((model) => {
                        const isDefault = model.id === config.defaultModel && model.providerId === config.defaultProvider;
                        return (
                          <div
                            key={model.id}
                            className="flex items-center justify-between py-1.5 pl-6 pr-2 rounded hover:bg-background"
                          >
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm truncate">{model.name}</span>
                                <TierBadge tier={model.tier} />
                                <StatusBadge status={model.runtimeStatus} />
                                {isDefault && (
                                  <Badge variant="outline" className="text-[10px]">
                                    <Star className="size-2.5" />
                                    <span className="hidden sm:inline">Default</span>
                                  </Badge>
                                )}
                              </div>
                              <div className="hidden sm:flex items-center gap-2">
                                <code className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
                                  {model.id}
                                </code>
                                {model.capabilities?.input?.text && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Text</Badge>
                                )}
                                {model.capabilities?.input?.image && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Image</Badge>
                                )}
                                {model.capabilities?.input?.video && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Video</Badge>
                                )}
                                {model.capabilities?.input?.file && model.capabilities.input.file.length > 0 && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    Files ({model.capabilities.input.file.length})
                                  </Badge>
                                )}
                                {model.variants && Object.keys(model.variants).length > 0 && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {Object.keys(model.variants).length} variant{Object.keys(model.variants).length !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                onClick={() => handleEditModel(model)}
                                title="Edit model"
                              >
                                <Pencil className="size-2.5" />
                              </Button>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                onClick={() => setDeleteModelTarget({ providerId: model.providerId, modelId: model.id })}
                                title="Delete model"
                              >
                                <Trash2 className="size-2.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteProviderTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteProviderTarget(null); }}
        title="Delete Provider"
        description={`Are you sure you want to delete "${deleteProviderTarget}"? All models under this provider will be removed.${config?.defaultProvider === deleteProviderTarget ? ' Warning: This is the current default provider.' : ''}`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteProvider}
      />

      <ConfirmDialog
        open={deleteModelTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteModelTarget(null); }}
        title="Delete Model"
        description={`Are you sure you want to delete "${deleteModelTarget?.modelId}"?${config?.defaultModel === deleteModelTarget?.modelId && config?.defaultProvider === deleteModelTarget?.providerId ? ' Warning: This is the current default model.' : ''}`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteModel}
      />
    </div>
  );
}
