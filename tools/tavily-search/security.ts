interface SecurityInput {
  args: {
    query: string;
    topic?: string;
    searchDepth?: string;
    maxResults?: number;
    timeRange?: string;
    includeAnswer?: boolean;
    includeRawContent?: boolean;
    includeImages?: boolean;
    includeDomains?: string[];
    excludeDomains?: string[];
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

const SENSITIVE_DOMAINS: string[] = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '.onion',
  'i2p',
];

const SENSITIVE_PATTERNS: RegExp[] = [
  /password/i,
  /secret/i,
  /api[_-]?key/i,
  /token/i,
  /credential/i,
  /private[_-]?key/i,
];

async function main() {
  try {
    const inputText = await Bun.stdin.text();
    const input: SecurityInput = JSON.parse(inputText);
    const { query, includeDomains, excludeDomains } = input.args;

    if (!query || query.trim() === '') {
      const result: SecurityResult = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'action',
        permissionKey: 'query:empty',
        message: 'Search query cannot be empty',
      };
      console.log(JSON.stringify(result));
      return;
    }

    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(query))) {
      const result: SecurityResult = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'action',
        permissionKey: 'query:sensitive',
        message: 'Search query contains sensitive patterns and is not allowed',
        details: { query: query.slice(0, 100) },
      };
      console.log(JSON.stringify(result));
      return;
    }

    const checkDomains = (domains: string[] | undefined, _type: 'include' | 'exclude'): boolean => {
      if (!domains) return true;
      return !domains.some(domain =>
        SENSITIVE_DOMAINS.some(sensitive =>
          domain.toLowerCase().includes(sensitive)
        )
      );
    };

    if (!checkDomains(includeDomains, 'include') || !checkDomains(excludeDomains, 'exclude')) {
      const result: SecurityResult = {
        allowed: false,
        requiresApproval: false,
        permissionType: 'action',
        permissionKey: 'domain:sensitive',
        message: 'Cannot search with sensitive domain filters',
        details: {
          includeDomains,
          excludeDomains,
        },
      };
      console.log(JSON.stringify(result));
      return;
    }

    const result: SecurityResult = {
      allowed: true,
      requiresApproval: false,
      permissionType: 'tool',
      permissionKey: 'tool:tavily-search',
      message: 'Search query is valid',
      details: {
        queryLength: query.length,
        topic: input.args.topic,
        searchDepth: input.args.searchDepth,
        maxResults: input.args.maxResults,
      },
    };

    console.log(JSON.stringify(result));
  } catch (err: unknown) {
    console.log(
      JSON.stringify({
        allowed: false,
        requiresApproval: false,
        permissionType: 'tool',
        permissionKey: 'tool:tavily-search',
        message: `Security check failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }
}

main();
