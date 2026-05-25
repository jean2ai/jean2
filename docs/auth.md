# Security & Authentication

## Default: No Auth

By default, Jean2 has **no authentication**. The server binds to `0.0.0.0` and accepts all connections. This is fine for:

- Local development
- Tailscale / VPN networks
- Air-gapped machines

If you expose Jean2 to a network you don't fully trust, enable authentication.

## Enabling Authentication

Set a single environment variable:

```bash
# In ~/.jean2/.env
JEAN2_AUTH_TOKEN=your-secret-token
```

Then restart the server:

```bash
jean2 restart
```

### How it works

Once `JEAN2_AUTH_TOKEN` is set:

- All `/api/*` routes require authentication
- WebSocket connections require authentication
- Public routes (`/`, `/api/health`, `/api/info`, attachment content) remain open

Clients provide the token in one of two ways:

```
Authorization: Bearer your-secret-token
```

Or as a query parameter:

```
?token=your-secret-token
```

### Token security

- Tokens are compared using a **constant-time comparison** to prevent timing attacks
- Tokens are stored as plain environment variables — use appropriate filesystem permissions on `~/.jean2/.env`

### Checking auth status

```bash
jean2 auth
```

Shows whether authentication is enabled and displays a masked token preview.

## TLS (HTTPS)

For connections over untrusted networks, enable TLS:

```bash
# In ~/.jean2/.env
JEAN2_TLS_ENABLED=true
JEAN2_TLS_CERT_FILE=/path/to/cert.pem
JEAN2_TLS_KEY_FILE=/path/to/key.pem
```

### Tailscale HTTPS

When using the PWA on mobile over Tailscale, browsers require HTTPS. Tailscale makes this simple with built-in TLS certificates:

1. **Enable HTTPS in Tailscale** — follow the [Tailscale HTTPS guide](https://tailscale.com/docs/how-to/set-up-https-certificates) to enable the feature in your tailnet

2. **Generate a certificate** for your server machine:

```bash
tailscale cert jean2-server.tailnet-name.ts.net
```

3. **Add to `~/.jean2/.env`**:

```bash
JEAN2_TLS_ENABLED=true
JEAN2_TLS_CERT_FILE=/path/to/jean2-server.tailnet-name.ts.net.crt
JEAN2_TLS_KEY_FILE=/path/to/jean2-server.tailnet-name.ts.net.key
```

4. **Restart** and connect using your Tailscale domain:

```
https://jean2-server.tailnet-name.ts.net:8742
```

### Using a reverse proxy

For other deployments, use a reverse proxy:

```nginx
# Example nginx config
server {
    listen 443 ssl;
    server_name jean2.example.com;

    ssl_certificate /etc/letsencrypt/live/jean2.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jean2.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8742;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## Public Routes

These routes are always accessible without authentication:

| Route | Purpose |
|-------|---------|
| `GET /` | Health check |
| `GET /api/health` | Server health status |
| `GET /api/info` | Server version and info |
| `GET /api/sessions/:id/attachments/:id/content` | Attachment file downloads |

## Permissions

Separate from authentication, Jean2 has a **tool permission system**:

- Tools that modify files, run commands, or access the network require user approval
- Permissions are per-workspace and per-tool
- Users can approve once, approve always, or deny
- The "auto-approve" mode allows readonly tools (read-file, glob, grep, etc.) to run without asking

Permissions are stored in the SQLite database and persist across restarts.
