import type { ToolDefinition, ToolContext, ToolResult } from '@jean2/sdk';

interface ActiveTabResult {
  title: string;
  url: string;
  text: string;
}

export const definition: ToolDefinition = {
  name: 'browser_read_active_tab',
  description:
    'Read the active Chrome browser tab. Returns the page title, URL, and visible text content. ' +
    'Requires a connected Jean2 Autochrome extension and controller approval.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  timeout: 120000,
};

export async function execute(
  _input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    // Step 1: Human approval ask (routed to session controller)
    const approved = await ctx.ask({
      type: 'confirm',
      target: 'human',
      question: 'Allow Jean2 to read the active Chrome tab?',
      description:
        'Jean2 wants to read the title, URL, and visible text from your active Chrome tab.',
    });

    if (!approved) {
      return {
        success: false,
        error: 'Browser read denied by controller.',
      };
    }

    // Step 2: Execution ask to extension (capability-routed)
    // The ask system routes client_capability asks to session participants
    // with matching capabilities (first_eligible resolution mode).
    // If no eligible extension client is connected, this will time out.
    const executionResult = await ctx.ask({
      type: 'client_capability',
      target: 'client',
      capability: 'active_tab_read',
      metadata: {
        task: 'browser.read_active_tab',
      },
    });

    if (!executionResult || typeof executionResult !== 'object') {
      return {
        success: false,
        error: 'Extension returned an invalid response.',
      };
    }

    const result = executionResult as ActiveTabResult;

    if (!result.title && !result.url && !result.text) {
      return {
        success: false,
        error: 'Extension returned empty result.',
      };
    }

    return {
      success: true,
      result: {
        title: result.title || '',
        url: result.url || '',
        text: result.text || '',
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('timed out') || message.includes('did not respond')) {
      return {
        success: false,
        error:
          'Browser read timed out. Ensure the Jean2 Autochrome extension is installed, connected, and the active tab is accessible.',
      };
    }

    return {
      success: false,
      error: `Browser read failed: ${message}`,
    };
  }
}
