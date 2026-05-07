// =============================================================================
// Autochrome Background Service Worker
//
// Main extension runtime:
// - Connects to Jean2 server on startup
// - Listens for client_capability asks targeting active_tab_read
// - Executes tab read and sends structured response
// =============================================================================

import { AutochromeClient } from './client';
import { getOrCreateClientId } from './storage';
import { getConfig } from './config';
import type { ActiveTabData } from './types';

const MAX_TEXT_LENGTH = 50_000;

let autochromeClient: AutochromeClient | null = null;

// ── Active Tab Reading ──────────────────────────────────────

async function readActiveTab(): Promise<ActiveTabData> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  const title = tab.title ?? '';
  const url = tab.url ?? '';

  if (!tab.id) {
    throw new Error('Active tab has no ID');
  }

  let text: string;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'extract_visible_text',
    });
    text = response?.text ?? '';
  } catch {
    text = '[Could not extract text from this page]';
  }

  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH) + '\n\n[... text truncated]';
  }

  return { title, url, text };
}

// ── Connection Lifecycle ────────────────────────────────────

async function connectToServer(): Promise<void> {
  try {
    const [clientId, config] = await Promise.all([
      getOrCreateClientId(),
      getConfig(),
    ]);

    autochromeClient = new AutochromeClient();

    // Set up ask handler before connecting
    autochromeClient.onAskRequest(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (sessionId: string, toolCallId: string, toolName: string, ask: any, requestId?: string) => {
        await handleAskRequest(sessionId, toolCallId, toolName, ask, requestId);
      },
    );

    await autochromeClient.connect(config, clientId);
    console.log('[autochrome] Connected and registered');
  } catch (err) {
    console.error('[autochrome] Failed to connect:', err);
    autochromeClient = null;
  }
}

async function handleAskRequest(
  _sessionId: string,
  toolCallId: string,
  _toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ask: any,
  requestId?: string,
): Promise<void> {
  if (!autochromeClient) return;

  // Only handle client_capability asks for active_tab_read
  if (ask?.type !== 'client_capability') return;
  if (ask?.capability !== 'active_tab_read') return;

  try {
    const tabData = await readActiveTab();

    autochromeClient.sendAskResponse(
      toolCallId,
      {
        type: 'client_capability',
        capability: 'active_tab_read',
        result: tabData,
      },
      requestId,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[autochrome] Tab read failed:', message);

    autochromeClient.sendAskResponse(
      toolCallId,
      {
        type: 'client_capability',
        capability: 'active_tab_read',
        result: {
          title: '',
          url: '',
          text: '',
          error: message,
        },
      },
      requestId,
    );
  }
}

// ── Extension Lifecycle ─────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[autochrome] Extension installed');
  connectToServer();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[autochrome] Browser startup');
  connectToServer();
});

// Auto-reconnect on config changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes['autochrome_config']) {
    console.log('[autochrome] Config changed, reconnecting...');
    if (autochromeClient) {
      autochromeClient.disconnect().then(() => connectToServer());
    } else {
      connectToServer();
    }
  }
});
