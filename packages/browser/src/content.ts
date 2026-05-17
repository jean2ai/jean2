// =============================================================================
// Content Script - Page interaction layer
//
// Handles two types of messages from the background service worker:
//   1. extract_visible_text — read the visible text on the page
//   2. dom_action           — perform a DOM interaction (click, type, select, etc.)
// =============================================================================

const MAX_TEXT_LENGTH = 50_000;
const TRUNCATION_SUFFIX = '\n\n[... text truncated]';

// ── Element Resolution ──────────────────────────────────────

function resolveElement(selector: string): Element | null {
  return document.querySelector(selector);
}

function resolveElements(selector: string): Element[] {
  return Array.from(document.querySelectorAll(selector));
}

// Find an element by its visible text content (case-insensitive substring match)
function findElementByText(text: string, tag?: string): HTMLElement | null {
  const xpath = tag
    ? `//${tag}[contains(translate(normalize-space(text()), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${text.toLowerCase()}')]`
    : `//*[contains(translate(normalize-space(text()), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${text.toLowerCase()}')]`;
  const result = document.evaluate(xpath, document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue as HTMLElement | null;
}

// Find the closest clickable ancestor (or the element itself)
function findClickable(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current) {
    const tag = current.tagName.toLowerCase();
    if (
      tag === 'a' ||
      tag === 'button' ||
      tag === 'select' ||
      current.getAttribute('role') === 'button' ||
      current.onclick !== null ||
      current.isContentEditable
    ) {
      return current;
    }
    // Check for pointer cursor
    if (getComputedStyle(current).cursor === 'pointer') {
      return current;
    }
    current = current.parentElement;
  }
  return element;
}

// ── DOM Actions ─────────────────────────────────────────────

interface DomActionParams {
  action: 'click' | 'type' | 'select' | 'clear' | 'scroll' | 'hover' | 'press_enter' | 'check' | 'uncheck';
  selector?: string;
  text?: string;
  value?: string;
  x?: number;
  y?: number;
  delay?: number;
}

interface DomActionResult {
  success: boolean;
  error?: string;
  elementFound?: boolean;
  currentValue?: string;
  pageChanged?: boolean;
}

function simulateClick(element: HTMLElement): void {
  const events = ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'click'];
  for (const eventType of events) {
    const event = new MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    element.dispatchEvent(event);
  }
}

function simulateInput(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Focus
  element.focus();
  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

  // Set value
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set || Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  // Dispatch input events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function simulateKeyDown(element: HTMLElement, key: string): void {
  const event = new KeyboardEvent('keydown', {
    key,
    code: `Key${key.toUpperCase()}`,
    keyCode: key === 'Enter' ? 13 : key.charCodeAt(0),
    which: key === 'Enter' ? 13 : key.charCodeAt(0),
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);

  const upEvent = new KeyboardEvent('keyup', {
    key,
    code: `Key${key.toUpperCase()}`,
    keyCode: key === 'Enter' ? 13 : key.charCodeAt(0),
    which: key === 'Enter' ? 13 : key.charCodeAt(0),
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(upEvent);
}

async function executeDomAction(params: DomActionParams): Promise<DomActionResult> {
  const { action, selector, text, value, x, y, delay } = params;
  const waitMs = delay ?? 100;

  switch (action) {
    case 'click': {
      let element: HTMLElement | null = null;

      if (selector) {
        element = resolveElement(selector) as HTMLElement | null;
      } else if (text) {
        element = findElementByText(text);
      }

      if (!element) {
        return { success: false, error: `Element not found: ${selector ?? text ?? '(no selector or text)'}`, elementFound: false };
      }

      const clickable = findClickable(element);
      if (!clickable) {
        return { success: false, error: `No clickable element found for: ${selector ?? text ?? '(no selector or text)'}`, elementFound: false };
      }
      simulateClick(clickable);

      await wait(waitMs);
      return { success: true, elementFound: true, pageChanged: true };
    }

    case 'type': {
      if (!selector && !text) {
        return { success: false, error: 'type action requires a selector to identify the input element' };
      }

      let input: HTMLElement | null = null;
      if (selector) {
        input = resolveElement(selector) as HTMLElement | null;
      } else if (text) {
        // text param here is used as a label to find the input
        input = findElementByText(text, 'label');
        if (input) {
          const forAttr = input.getAttribute('for');
          if (forAttr) {
            input = document.getElementById(forAttr) as HTMLElement | null;
          } else {
            input = input.querySelector('input, textarea') as HTMLElement | null;
          }
        }
      }

      if (!input || !('value' in input)) {
        return { success: false, error: `Input element not found: ${selector ?? '(label text)'}`, elementFound: false };
      }

      simulateInput(input as HTMLInputElement, value ?? '');

      await wait(waitMs);
      return { success: true, elementFound: true, currentValue: (input as HTMLInputElement).value };
    }

    case 'clear': {
      if (!selector) {
        return { success: false, error: 'clear action requires a selector' };
      }

      const input = resolveElement(selector) as HTMLInputElement | null;
      if (!input || !('value' in input)) {
        return { success: false, error: `Input element not found: ${selector}`, elementFound: false };
      }

      simulateInput(input, '');

      await wait(waitMs);
      return { success: true, elementFound: true };
    }

    case 'select': {
      if (!selector) {
        return { success: false, error: 'select action requires a selector' };
      }

      const select = resolveElement(selector) as HTMLSelectElement | null;
      if (!select || select.tagName !== 'SELECT') {
        return { success: false, error: `Select element not found: ${selector}`, elementFound: false };
      }

      select.value = value ?? '';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      await wait(waitMs);
      return { success: true, elementFound: true, currentValue: select.value };
    }

    case 'check':
    case 'uncheck': {
      if (!selector) {
        return { success: false, error: `${action} action requires a selector` };
      }

      const checkbox = resolveElement(selector) as HTMLInputElement | null;
      if (!checkbox || checkbox.type !== 'checkbox') {
        return { success: false, error: `Checkbox not found: ${selector}`, elementFound: false };
      }

      const shouldCheck = action === 'check';
      if (checkbox.checked !== shouldCheck) {
        simulateClick(checkbox);
      }

      await wait(waitMs);
      return { success: true, elementFound: true, currentValue: String(checkbox.checked) };
    }

    case 'scroll': {
      const scrollX = x ?? 0;
      const scrollY = y ?? 0;

      if (selector) {
        const element = resolveElement(selector) as HTMLElement | null;
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        window.scrollBy({ left: scrollX, top: scrollY, behavior: 'smooth' });
      }

      await wait(waitMs + 300);
      return { success: true, elementFound: true };
    }

    case 'hover': {
      if (!selector && !text) {
        return { success: false, error: 'hover action requires a selector or text' };
      }

      let element: HTMLElement | null = null;
      if (selector) {
        element = resolveElement(selector) as HTMLElement | null;
      } else if (text) {
        element = findElementByText(text);
      }

      if (!element) {
        return { success: false, error: `Element not found: ${selector ?? text}`, elementFound: false };
      }

      const rect = element.getBoundingClientRect();
      const eventInit = {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      };
      element.dispatchEvent(new MouseEvent('mouseover', eventInit));
      element.dispatchEvent(new MouseEvent('mouseenter', eventInit));
      element.dispatchEvent(new MouseEvent('mousemove', eventInit));

      await wait(waitMs);
      return { success: true, elementFound: true };
    }

    case 'press_enter': {
      if (!selector) {
        // Press Enter on the currently focused element
        const focused = document.activeElement as HTMLElement | null;
        if (focused) {
          simulateKeyDown(focused, 'Enter');
          await wait(waitMs);
          return { success: true, elementFound: true };
        }
        return { success: false, error: 'No element is focused and no selector provided' };
      }

      const element = resolveElement(selector) as HTMLElement | null;
      if (!element) {
        return { success: false, error: `Element not found: ${selector}`, elementFound: false };
      }

      simulateKeyDown(element, 'Enter');
      await wait(waitMs);
      return { success: true, elementFound: true };
    }

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

// ── Element Discovery ───────────────────────────────────────

interface ElementInfo {
  tag: string;
  id?: string;
  className?: string;
  type?: string;
  placeholder?: string;
  text?: string;
  href?: string;
  value?: string;
  selector: string;
  role?: string;
  ariaLabel?: string;
}

function discoverInteractiveElements(): ElementInfo[] {
  const interactiveSelectors = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[onclick]',
    '[contenteditable]',
  ];

  const seen = new Set<Element>();
  const results: ElementInfo[] = [];

  for (const sel of interactiveSelectors) {
    for (const el of resolveElements(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);

      const htmlEl = el as HTMLElement;
      const tag = htmlEl.tagName.toLowerCase();
      const text = htmlEl.textContent?.trim().slice(0, 100) ?? '';
      const id = htmlEl.id || undefined;
      const className = htmlEl.className && typeof htmlEl.className === 'string'
        ? htmlEl.className.split(/\s+/).filter(Boolean).slice(0, 3).join(' ')
        : undefined;

      // Build a unique selector
      let selector: string;
      if (htmlEl.id) {
        selector = `#${CSS.escape(htmlEl.id)}`;
      } else {
        // Try name attribute
        const name = htmlEl.getAttribute('name');
        if (name) {
          selector = `${tag}[name="${CSS.escape(name)}"]`;
        } else {
          // Use nth-of-type
          const parent = htmlEl.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === htmlEl.tagName);
            const index = siblings.indexOf(htmlEl) + 1;
            selector = `${tag}:nth-of-type(${index})`;
          } else {
            selector = tag;
          }
        }
      }

      const info: ElementInfo = {
        tag,
        selector,
        text: text || undefined,
      };

      if (id) info.id = id;
      if (className) info.className = className;
      if (htmlEl.getAttribute('role')) info.role = htmlEl.getAttribute('role') ?? undefined;
      if (htmlEl.getAttribute('aria-label')) info.ariaLabel = htmlEl.getAttribute('aria-label') ?? undefined;

      if (tag === 'input') {
        const input = htmlEl as HTMLInputElement;
        info.type = input.type || undefined;
        info.placeholder = input.placeholder || undefined;
        info.value = input.value || undefined;
      } else if (tag === 'textarea') {
        const ta = htmlEl as HTMLTextAreaElement;
        info.placeholder = ta.placeholder || undefined;
        info.value = ta.value || undefined;
      } else if (tag === 'select') {
        const sel2 = htmlEl as HTMLSelectElement;
        info.value = sel2.value || undefined;
      } else if (tag === 'a') {
        info.href = (htmlEl as HTMLAnchorElement).href || undefined;
      }

      results.push(info);
    }
  }

  return results;
}

// ── Text Extraction ─────────────────────────────────────────

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

// ── Message Handling ────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

chrome.runtime.onMessage.addListener(
  (message: { type: string; [key: string]: unknown }, _sender, sendResponse) => {
    if (message.type === 'extract_visible_text') {
      const text = extractVisibleText();
      sendResponse({ text });
      return true;
    }

    if (message.type === 'dom_action') {
      const params = message.params as DomActionParams;
      executeDomAction(params)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          sendResponse({ success: false, error: errorMessage });
        });
      return true;
    }

    if (message.type === 'discover_elements') {
      const elements = discoverInteractiveElements();
      sendResponse({ elements });
      return true;
    }
  },
);
