import { useState, useEffect, useCallback } from 'react';
import type { Jean2Client, ToolDefinition, ToolEnvVarStatus } from '@jean2/sdk';
import { Wrench, Check, X, Trash2, Eye, EyeOff, Loader2, ShieldCheck, ShieldAlert, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface PanelProps {
  sdkClient: Jean2Client | null;
}

export function ToolsPanel({ sdkClient }: PanelProps) {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [envVars, setEnvVars] = useState<ToolEnvVarStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showSensitive, setShowSensitive] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!sdkClient) return;
    setLoading(true);
    setError(null);
    try {
      const [toolsData, envData] = await Promise.all([
        sdkClient.http.tools.list(),
        sdkClient.http.tools.listEnvVars(),
      ]);
      setTools(toolsData.tools);
      setEnvVars(envData.envVars);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools');
    } finally {
      setLoading(false);
    }
  }, [sdkClient]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSetValue = async (key: string) => {
    if (!sdkClient || !editValue.trim()) return;
    setActionLoading(key);
    try {
      await sdkClient.http.tools.setEnvVar(key, { value: editValue.trim() });
      setEditingKey(null);
      setEditValue('');
      setShowSensitive(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set value');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearValue = async (key: string) => {
    if (!sdkClient) return;
    setActionLoading(key);
    try {
      await sdkClient.http.tools.clearEnvVar(key);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear value');
    } finally {
      setActionLoading(null);
    }
  };

  // Build a map of tool name -> env vars for that tool
  const toolEnvMap = new Map<string, string[]>();
  for (const env of envVars) {
    if (env.usedBy) {
      for (const toolName of env.usedBy) {
        const existing = toolEnvMap.get(toolName) || [];
        existing.push(env.key);
        toolEnvMap.set(toolName, existing);
      }
    }
  }

  // Count env status per tool
  const getToolEnvStatus = (tool: ToolDefinition) => {
    const requiredEnvs = tool.env || [];
    if (requiredEnvs.length === 0) return { total: 0, missing: 0 };
    const missing = requiredEnvs.filter(key => {
      const env = envVars.find(e => e.key === key);
      return !env || !env.configured;
    });
    return { total: requiredEnvs.length, missing: missing.length };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && tools.length === 0) {
    return (
      <div className="p-4 text-sm text-destructive">{error}</div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {error && (
        <div className="p-2 rounded bg-destructive/10 text-sm text-destructive">{error}</div>
      )}

      {/* Loaded Tools Section */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Wrench className="size-4" />
          Loaded Tools ({tools.length})
        </h3>
        <div className="space-y-1">
          {tools.map((tool) => {
            const envStatus = getToolEnvStatus(tool);
            return (
              <div
                key={tool.name}
                className="flex items-center justify-between p-2.5 rounded-lg border"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{tool.name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {tool.runtime}
                    </Badge>
                    {tool.dangerous && (
                      <Badge variant="destructive" className="text-xs shrink-0">
                        dangerous
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {tool.description}
                  </p>
                </div>
                <div className="shrink-0 ml-2">
                  {envStatus.total === 0 ? (
                    <Badge variant="secondary" className="text-xs">
                      <Check className="size-3 mr-1" />
                      Ready
                    </Badge>
                  ) : envStatus.missing > 0 ? (
                    <Badge variant="outline" className="text-xs text-orange-500 border-orange-300">
                      <ShieldAlert className="size-3 mr-1" />
                      {envStatus.missing} env missing
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-xs">
                      <ShieldCheck className="size-3 mr-1" />
                      Configured
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {envVars.length > 0 && (
        <>
          <Separator />
          {/* Environment Variables Section */}
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              Environment Variables ({envVars.length})
            </h3>
            <div className="space-y-2">
              {envVars.map((env) => (
                <div
                  key={env.key}
                  className="p-3 rounded-lg border"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {env.configured ? (
                        <Check className="size-4 text-green-500" />
                      ) : (
                        <X className="size-4 text-orange-500" />
                      )}
                      <span className="text-sm font-mono font-medium">{env.key}</span>
                      {env.sensitive && (
                        <Lock className="size-3 text-muted-foreground" />
                      )}
                      <Badge variant={env.configured ? 'default' : 'secondary'} className="text-xs">
                        {env.configured ? 'Configured' : 'Not set'}
                      </Badge>
                    </div>
                  </div>

                  {env.usedBy && env.usedBy.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Required by: {env.usedBy.join(', ')}
                    </p>
                  )}

                  {/* Current value for non-sensitive configured vars */}
                  {env.configured && !env.sensitive && env.value && editingKey !== env.key && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      Value: {env.value}
                    </p>
                  )}

                  {/* Edit mode */}
                  {editingKey === env.key ? (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="relative flex-1">
                        <Input
                          type={env.sensitive ? (showSensitive ? 'text' : 'password') : 'text'}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder={env.sensitive ? 'Enter secret value...' : 'Enter value...'}
                          className="h-8 text-sm pr-8"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSetValue(env.key);
                            if (e.key === 'Escape') {
                              setEditingKey(null);
                              setEditValue('');
                            }
                          }}
                          autoFocus
                        />
                        {env.sensitive && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-8 w-8"
                            onClick={() => setShowSensitive(!showSensitive)}
                          >
                            {showSensitive ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                          </Button>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleSetValue(env.key)}
                        disabled={!editValue.trim() || actionLoading === env.key}
                      >
                        {actionLoading === env.key ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingKey(null);
                          setEditValue('');
                        }}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingKey(env.key);
                          setEditValue('');
                          setShowSensitive(false);
                        }}
                        disabled={actionLoading === env.key}
                      >
                        {env.configured ? 'Update' : 'Set Value'}
                      </Button>
                      {env.configured && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleClearValue(env.key)}
                          disabled={actionLoading === env.key}
                        >
                          {actionLoading === env.key ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {envVars.length === 0 && tools.length > 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No environment variables required by installed tools.
        </p>
      )}
    </div>
  );
}