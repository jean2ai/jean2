import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
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
import type { SavedServer } from '@jean2/shared';
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
  const { prepareForServerAdd, addServer, editServer: updateServer } = useServerContext();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = editServer !== null && editServer !== undefined;

  useEffect(() => {
    if (editServer) {
      setName(editServer.name);
      setUrl(editServer.url);
      setToken(editServer.token);
    } else {
      setName('');
      setUrl('localhost:8742');
      setToken('');
    }
    setError(null);
    setShowToken(false);
  }, [editServer, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const trimmedToken = token.trim();

    if (!trimmedName) {
      setError('Name is required');
      return;
    }

    if (!trimmedUrl) {
      setError('Server URL is required');
      return;
    }

    if (!trimmedToken) {
      setError('API token is required');
      return;
    }

    if (!isValidTokenFormat(trimmedToken)) {
      setError('Token must be 64 hexadecimal characters');
      return;
    }

    const normalizedUrl = normalizeServerUrl(trimmedUrl);

    if (isEditing) {
      updateServer(editServer.id, {
        name: trimmedName,
        url: normalizedUrl,
        token: trimmedToken,
      });
    } else {
      prepareForServerAdd();
      addServer(trimmedName, normalizedUrl, trimmedToken);
    }

    onOpenChange(false);
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
              <Label htmlFor="server-token">API Token</Label>
              <div className="relative">
                <Input
                  id="server-token"
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="64-character hex string"
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
