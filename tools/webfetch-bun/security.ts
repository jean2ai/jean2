interface SecurityInput {
  args: {
    url: string;
    format?: 'markdown' | 'text' | 'html';
    timeout?: number;
  };
  workspacePath: string;
  sessionId: string;
}

interface SecurityResult {
  allowed: boolean;
  requiresApproval: boolean;
  permissionType: 'tool' | 'action';
  permissionKey: string;
  message: string;
  details?: Record<string, unknown>;
}

function isPrivateIP(hostname: string): boolean {
  let cleanHostname = hostname;
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    cleanHostname = hostname.slice(1, -1);
  }

  if (cleanHostname === 'localhost' || cleanHostname === 'localhost.localdomain') {
    return true;
  }

  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = cleanHostname.match(ipv4Regex);

  if (match) {
    const [, a, b, _c, _d] = match.map(Number);

    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
  }

  if (cleanHostname === '::1' || cleanHostname === '::') return true;

  if (cleanHostname.startsWith('fc') || cleanHostname.startsWith('fd') || cleanHostname.startsWith('fe80:')) {
    return true;
  }

  return false;
}

async function main() {
  const inputText = await Bun.stdin.text();
  const input: SecurityInput = JSON.parse(inputText);
  const { url } = input.args;

  try {
    const urlObj = new URL(url);

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      const result: SecurityResult = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'action',
        permissionKey: 'url:blocked_scheme',
        message: `Only HTTP and HTTPS URLs are allowed. Blocked: ${urlObj.protocol}`,
      };
      console.log(JSON.stringify(result));
      return;
    }

    if (isPrivateIP(urlObj.hostname)) {
      const result: SecurityResult = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'action',
        permissionKey: 'url:private_ip',
        message: `Access to private IP addresses and localhost is not allowed: ${urlObj.hostname}`,
      };
      console.log(JSON.stringify(result));
      return;
    }

    const blockedHostnames = [
      'metadata.google.internal',
      '169.254.169.254',
      'metadata.azure.com',
      'metadata.googleusercontent.com',
    ];

    if (blockedHostnames.includes(urlObj.hostname)) {
      const result: SecurityResult = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'action',
        permissionKey: 'url:metadata_endpoint',
        message: `Access to cloud metadata endpoints is not allowed: ${urlObj.hostname}`,
      };
      console.log(JSON.stringify(result));
      return;
    }

    const requiresApproval = urlObj.protocol !== 'https:';

    const result: SecurityResult = {
      allowed: true,
      requiresApproval,
      permissionType: 'tool',
      permissionKey: 'tool:webfetch',
      message: requiresApproval
        ? 'HTTP URL requires approval (unencrypted connection).'
        : 'HTTPS URL fetch allowed.',
      details: {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port,
      },
    };

    console.log(JSON.stringify(result));
  } catch (err: unknown) {
    const result: SecurityResult = {
      allowed: false,
      requiresApproval: false,
      permissionType: 'tool',
      permissionKey: 'tool:webfetch',
      message: `Security check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
    console.log(JSON.stringify(result));
  }
}

main();
