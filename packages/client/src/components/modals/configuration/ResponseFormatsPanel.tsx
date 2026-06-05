import { useState, useCallback } from 'react';
import type { Jean2Client, ResponseFormat } from '@jean2/sdk';
import { useResponseFormatsQuery, useCreateResponseFormat, useUpdateResponseFormat, useDeleteResponseFormat } from '@/hooks/queries';
import { Braces, Plus, Pencil, Trash2, ArrowLeft, Loader2, GripVertical, Code, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';

interface PanelProps {
  sdkClient: Jean2Client | null;
}

type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'array', label: 'List' },
  { value: 'object', label: 'Object' },
];

interface FieldDef {
  name: string;
  type: FieldType;
  description: string;
  required: boolean;
}

function schemaToFields(schema: Record<string, unknown>): FieldDef[] {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set(schema.required as string[] ?? []);
  return Object.entries(props).map(([name, def]) => ({
    name,
    type: (FIELD_TYPES.some(ft => ft.value === def.type) ? def.type : 'string') as FieldType,
    description: (def.description as string) ?? '',
    required: required.has(name),
  }));
}

function fieldsToSchema(fields: FieldDef[]): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const field of fields) {
    const prop: Record<string, unknown> = { type: field.type };
    if (field.description.trim()) {
      prop.description = field.description.trim();
    }
    if (field.type === 'array') {
      prop.items = { type: 'string' };
    }
    if (field.type === 'object') {
      prop.properties = {};
      prop.required = [];
    }
    properties[field.name] = prop;
    if (field.required) {
      required.push(field.name);
    }
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

function validateJsonSchema(schema: unknown): { valid: boolean; error?: string } {
  if (!schema || typeof schema !== 'object') {
    return { valid: false, error: 'Schema must be a JSON object' };
  }
  const obj = schema as Record<string, unknown>;
  if (obj.type !== 'object') {
    return { valid: false, error: 'Schema must have "type": "object"' };
  }
  return { valid: true };
}

export function ResponseFormatsPanel({ sdkClient }: PanelProps) {
  const { data: formatsData, isLoading: loading } = useResponseFormatsQuery(sdkClient);
  const createMut = useCreateResponseFormat(sdkClient);
  const updateMut = useUpdateResponseFormat(sdkClient);
  const deleteMut = useDeleteResponseFormat(sdkClient);
  const formats: ResponseFormat[] = formatsData?.formats ?? [];
  const [error, setError] = useState<string | null>(null);

  const [editingFormat, setEditingFormat] = useState<ResponseFormat | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const [rawMode, setRawMode] = useState(false);
  const [editSchema, setEditSchema] = useState('');
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleCreate = () => {
    setIsCreating(true);
    setEditingFormat(null);
    setEditName('');
    setEditDescription('');
    setRawMode(false);
    setFields([]);
    setEditSchema(JSON.stringify({ type: 'object', properties: {}, required: [], additionalProperties: false }, null, 2));
    setSchemaError(null);
    setError(null);
  };

  const handleEdit = (format: ResponseFormat) => {
    setEditingFormat(format);
    setIsCreating(false);
    setEditName(format.name);
    setEditDescription(format.description ?? '');
    setRawMode(false);
    const parsedFields = schemaToFields(format.schema as Record<string, unknown>);
    setFields(parsedFields);
    setEditSchema(JSON.stringify(format.schema, null, 2));
    setSchemaError(null);
    setError(null);
  };

  const syncFieldsToRaw = useCallback((newFields: FieldDef[]) => {
    const schema = fieldsToSchema(newFields);
    setEditSchema(JSON.stringify(schema, null, 2));
    setSchemaError(null);
  }, []);

  const syncRawToFields = useCallback((raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.type === 'object' && parsed.properties && typeof parsed.properties === 'object') {
        setFields(schemaToFields(parsed) as FieldDef[]);
        setSchemaError(null);
      } else {
        setSchemaError('Schema must have "type": "object" with "properties"');
      }
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  }, []);

  const handleFieldChange = (index: number, updates: Partial<FieldDef>) => {
    setFields(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      if (updates.name !== undefined) {
        next[index].name = updates.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      }
      syncFieldsToRaw(next);
      return next;
    });
  };

  const handleAddField = () => {
    setFields(prev => {
      const next: FieldDef[] = [...prev, { name: `field_${prev.length + 1}`, type: 'string' as FieldType, description: '', required: false }];
      syncFieldsToRaw(next);
      return next;
    });
  };

  const handleRemoveField = (index: number) => {
    setFields(prev => {
      const next = prev.filter((_, i) => i !== index);
      syncFieldsToRaw(next);
      return next;
    });
  };

  const handleRawSchemaChange = (value: string) => {
    setEditSchema(value);
    syncRawToFields(value);
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    let parsedSchema: Record<string, unknown>;
    try {
      parsedSchema = JSON.parse(editSchema);
    } catch {
      setSchemaError('Invalid JSON - please fix before saving');
      return;
    }
    const validation = validateJsonSchema(parsedSchema);
    if (!validation.valid) {
      setSchemaError(validation.error ?? null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isCreating) {
        await createMut.mutateAsync({
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          schema: parsedSchema,
        });
      } else if (editingFormat) {
        await updateMut.mutateAsync({
          id: editingFormat.id,
          body: {
            name: editName.trim(),
            description: editDescription.trim() || undefined,
            schema: parsedSchema,
          },
        });
      }
      setIsCreating(false);
      setEditingFormat(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingFormat(null);
    setEditName('');
    setEditDescription('');
    setEditSchema('');
    setFields([]);
    setSchemaError(null);
  };

  if (isCreating || editingFormat) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleCancel}>
              <ArrowLeft className="size-4" />
            </Button>
            <h3 className="text-sm font-medium">
              {isCreating ? 'New Response Format' : `Edit: ${editingFormat?.name}`}
            </h3>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || !editName.trim()}>
            {saving ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
          </Button>
        </div>

        {error && (
          <div className="p-2 rounded bg-destructive/10 text-sm text-destructive">{error}</div>
        )}

        <div>
          <label className="text-sm font-medium mb-1 block">Name</label>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="My Format"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Description</label>
          <Input
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="What this format is used for"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Fields</label>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1.5 text-xs px-2"
                onClick={() => setRawMode(!rawMode)}
              >
                {rawMode ? <Eye className="size-3" /> : <Code className="size-3" />}
                {rawMode ? 'Visual' : 'Raw JSON'}
              </Button>
            </div>
          </div>

          {rawMode ? (
            <>
              <textarea
                value={editSchema}
                onChange={(e) => handleRawSchemaChange(e.target.value)}
                className={`w-full h-64 p-3 rounded-lg border font-mono text-sm resize-y ${
                  schemaError ? 'border-destructive bg-destructive/5' : 'bg-background'
                }`}
                placeholder='{"type": "object", "properties": {...}}'
              />
              {schemaError && (
                <p className="text-xs text-destructive mt-1">{schemaError}</p>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {fields.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-6 border rounded-lg border-dashed">
                  No fields yet. Add one below.
                </div>
              )}
              {fields.map((field, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2.5 rounded-lg border bg-background"
                >
                  <GripVertical className="size-4 text-muted-foreground mt-2 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={field.name}
                        onChange={(e) => handleFieldChange(i, { name: e.target.value })}
                        placeholder="field_name"
                        className="font-mono text-xs h-8"
                      />
                      <Select
                        value={field.type}
                        onValueChange={(value) => handleFieldChange(i, { type: value as FieldType })}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map(ft => (
                            <SelectItem key={ft.value} value={ft.value}>
                              {ft.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        value={field.description}
                        onChange={(e) => handleFieldChange(i, { description: e.target.value })}
                        placeholder="Description (optional)"
                        className="text-xs h-7 flex-1"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer">
                        <Switch
                          checked={field.required}
                          onCheckedChange={(checked) => handleFieldChange(i, { required: checked })}
                          className="scale-75"
                        />
                        Required
                      </label>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="mt-1.5 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveField(i)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-1"
                onClick={handleAddField}
              >
                <Plus className="size-3" data-icon="inline-start" />
                Add Field
              </Button>
            </div>
          )}
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
          {formats.length} format{formats.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="size-3" data-icon="inline-start" />
          New Format
        </Button>
      </div>

      {error && (
        <div className="p-2 rounded bg-destructive/10 text-sm text-destructive">{error}</div>
      )}

      {formats.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No response formats yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {formats.map((format) => {
            const propCount = Object.keys(
              (format.schema as Record<string, unknown>)?.properties
                ? ((format.schema as Record<string, unknown>).properties as Record<string, unknown>)
                : {},
            ).length;

            return (
              <div
                key={format.id}
                className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg border hover:bg-muted/50 cursor-pointer min-w-0 overflow-hidden"
                onClick={() => handleEdit(format)}
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <Braces className="size-4 text-muted-foreground shrink-0 hidden sm:block" />
                  <div className="flex flex-col flex-1 min-w-0 gap-0.5 sm:gap-1 overflow-hidden">
                    <span className="text-sm font-medium truncate">{format.name}</span>
                    {format.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{format.description}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {propCount} propert{propCount !== 1 ? 'ies' : 'y'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => handleEdit(format)}
                    title="Edit format"
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setDeleteTarget({ id: format.id, name: format.name })}
                    title="Delete format"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Response Format"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
