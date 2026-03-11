interface ModelSelectorProps {
  models: Array<{
    id: string;
    name: string;
    contextWindow: number;
    tier: 'budget' | 'standard' | 'premium';
    providerId: string;
    providerName: string;
  }>;
  selectedModelId: string | null | undefined;
  onChangeModel: (modelId: string, providerId: string) => void;
  disabled?: boolean;
}

export default function ModelSelector({ 
  models, 
  selectedModelId, 
  onChangeModel,
  disabled 
}: ModelSelectorProps) {
  // Group models by provider for organized display
  const groupedModels = models.reduce((acc, model) => {
    if (!acc[model.providerName]) {
      acc[model.providerName] = [];
    }
    acc[model.providerName].push(model);
    return acc;
  }, {} as Record<string, typeof models>);

  const getTierLabel = (tier: string) => {
    switch (tier) {
      case 'budget': return '$';
      case 'standard': return '$$';
      case 'premium': return '$$$';
      default: return '';
    }
  };

  const handleChange = (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    onChangeModel(modelId, model?.providerId || 'openai');
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-[13px] text-text-dim">Model:</label>
      <select
        value={selectedModelId || ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        className="px-2.5 py-1.5 bg-surface-700 border border-surface-500 rounded-md text-text-primary text-[13px] cursor-pointer min-w-[180px] focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {Object.entries(groupedModels).map(([providerName, providerModels]) => (
          <optgroup key={providerName} label={providerName}>
            {providerModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} ({getTierLabel(model.tier)})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
