// =============================================================================
// Content Script - Extracts visible text from the page DOM
// =============================================================================

const MAX_TEXT_LENGTH = 50_000;
const TRUNCATION_SUFFIX = '\n\n[... text truncated]';

function extractVisibleText(): string {
  const excludeTags = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
    'SVG', 'MATH', 'TEMPLATE', 'SLOT', 'DIALOG',
  ]);

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Text): number {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (excludeTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.offsetParent === null && getComputedStyle(parent).display !== 'contents') {
          return NodeFilter.FILTER_REJECT;
        }
        const text = node.textContent?.trim();
        if (!text) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  const parts: string[] = [];
  let totalLength = 0;

  while (walker.nextNode()) {
    const text = walker.currentNode.textContent!.trim();
    if (totalLength + text.length > MAX_TEXT_LENGTH) {
      parts.push(text.slice(0, MAX_TEXT_LENGTH - totalLength));
      parts.push(TRUNCATION_SUFFIX);
      break;
    }
    parts.push(text);
    totalLength += text.length;
  }

  return parts.join('\n');
}

chrome.runtime.onMessage.addListener(
  (message: { type: string }, _sender, sendResponse) => {
    if (message.type === 'extract_visible_text') {
      const text = extractVisibleText();
      sendResponse({ text });
      return true;
    }
  },
);
