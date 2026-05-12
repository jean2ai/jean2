import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useServerContext } from '@/contexts/ServerContext';
import type { SavedServer } from '@jean2/sdk';
import { isValidTokenFormat, normalizeServerUrl } from '@/config/auth';

interface AddServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editServer?: SavedServer | null;
}

export function AddServerDialog({
  open,
  onOpenChange,
  editServer,
}: AddServerDialogProps) {
  const navigate = useNavigate();
  const { addServer, editServer: updateServer } = useServerContext();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [useAuthToken, setUseAuthToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = editServer !== null && editServer !== undefined;

  useEffect(() => {
    if (editServer) {
      setName(editServer.name);
      setUrl(editServer.url);
      setToken(editServer.token ?? '');
      setUseAuthToken(!!editServer.token);
    } else {
      setName('');
      setUrl('localhost:8742');
      setToken('');
      setUseAuthToken(false);
    }
    setError(null);
    setShowToken(false);
  }, [editServer, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const trimmedToken = useAuthToken ? token.trim() : '';

    if (!trimmedName) {
      setError('Name is required');
      return;
    }

    if (!trimmedUrl) {
      setError('Server URL is required');
      return;
    }

    if (trimmedToken && !isValidTokenFormat(trimmedToken)) {
      setError('Token must be 64 hexadecimal characters');
      return;
    }

    const normalizedUrl = normalizeServerUrl(trimmedUrl);

    if (isEditing) {
      updateServer(editServer.id, {
        name: trimmedName,
        url: normalizedUrl,
        ...(trimmedToken ? { token: trimmedToken } : {}),
      });
      onOpenChange(false);
    } else {
      const newServer = addServer(trimmedName, normalizedUrl, trimmedToken || undefined);
      // Navigate to the new server
      navigate({ to: '/server/$serverId', params: { serverId: newServer.id } });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Server' : 'Add Server'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update server details'
              : 'Enter your server details'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="server-name">Name</Label>
              <Input
                id="server-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Server"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="server-url">Server URL</Label>
              <Input
                id="server-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="localhost:8742"
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>API Token</Label>
                <button
                  type="button"
                  onClick={() => setUseAuthToken(!useAuthToken)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${useAuthToken ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${useAuthToken ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {useAuthToken && (
                <div className="relative">
                  <Input
                    id="server-token"
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Required if auth is enabled"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-transparent"
                  >
                    {showToken ? (
                      <EyeOff className="size-4 text-muted-foreground" />
                    ) : (
                      <Eye className="size-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              {isEditing ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
