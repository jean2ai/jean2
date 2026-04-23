import { useEffect, useRef, useMemo, useCallback } from 'react';

function getHighlightColor(_textarea: HTMLTextAreaElement): string {
  // Read --primary from the computed styles on the textarea's root
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  if (!primary) return 'rgba(59, 130, 246, 0.15)';

  // --primary is in oklch format: oklch(L C H / alpha)
  // We need to convert to rgba for canvas compatibility.
  // Mix it at 25% opacity on transparent, matching the original CSS:
  //   color-mix(in oklch, var(--primary) 25%, transparent)
  //
  // The simplest reliable approach: use the browser's color-mix via a
  // temporary element's computed style to get the final rgba value.
  const temp = document.createElement('div');
  temp.style.color = `color-mix(in oklch, ${primary} 25%, transparent)`;
  document.body.appendChild(temp);
  const computed = getComputedStyle(temp).color;
  document.body.removeChild(temp);

  return computed; // Returns rgb(r, g, b, a) format — fully canvas-compatible
}

function paintHighlight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  ctx.fillStyle = color;
  const radius = 3;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, width, height);
  }
}

function measureAndPaint(
  canvas: HTMLCanvasElement,
  textarea: HTMLTextAreaElement,
  content: string,
  mentions: Set<string>,
  measureDiv: HTMLDivElement,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (!content || mentions.size === 0) {
    canvas.width = 0;
    canvas.height = 0;
    return;
  }

  const computed = getComputedStyle(textarea);

  // Copy all critical styles from textarea to measurement div
  // These MUST match exactly for pixel-accurate measurement
  measureDiv.style.fontFamily = computed.fontFamily;
  measureDiv.style.fontSize = computed.fontSize;
  measureDiv.style.fontWeight = computed.fontWeight;
  measureDiv.style.fontStyle = computed.fontStyle;
  measureDiv.style.letterSpacing = computed.letterSpacing;
  measureDiv.style.lineHeight = computed.lineHeight;
  measureDiv.style.paddingTop = computed.paddingTop;
  measureDiv.style.paddingRight = computed.paddingRight;
  measureDiv.style.paddingBottom = computed.paddingBottom;
  measureDiv.style.paddingLeft = computed.paddingLeft;
  measureDiv.style.width = `${textarea.clientWidth}px`;
  measureDiv.style.whiteSpace = 'pre-wrap';
  measureDiv.style.wordWrap = 'break-word';
  measureDiv.style.overflowWrap = 'break-word';
  measureDiv.style.boxSizing = 'border-box';

  // Escape HTML entities in the content
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Wrap @mention matches in <span> elements for measurement
  const html = escaped.replace(
    /@([^\s@&<>]+)/g,
    (match, path) => {
      if (mentions.has(path)) {
        return `<span data-mention>${match}</span>`;
      }
      return match;
    }
  );

  // Textareas always render with an extra trailing newline internally.
  // Add one to the div to match the textarea's layout exactly.
  measureDiv.innerHTML = html + '\n';

  // Size canvas to match textarea's content area dimensions
  const canvasWidth = textarea.clientWidth;
  const canvasHeight = textarea.scrollHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const color = getHighlightColor(textarea);

  // Read actual pixel positions of mention spans from the DOM.
  // These positions come from the browser's own text layout engine,
  // so they're guaranteed to match the textarea's rendering.
  const spans = measureDiv.querySelectorAll<HTMLSpanElement>('[data-mention]');
  for (const span of spans) {
    const x = span.offsetLeft;
    const y = span.offsetTop;
    const width = span.offsetWidth;
    const height = span.offsetHeight;

    paintHighlight(ctx, x, y, width, height, color);
  }
}

export function useHighlightBackground(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  content: string,
  mentions: string[],
): void {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const measureDivRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevContentRef = useRef<string>('');
  const prevMentionsRef = useRef<string[]>([]);

  const mentionSet = useMemo(() => new Set(mentions), [mentions]);

  const repaint = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Lazily create the offscreen canvas
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }

    // Lazily create and append the measurement div.
    // It's invisible (position: absolute, visibility: hidden) so it
    // doesn't affect page layout. We keep it in the DOM for reuse.
    if (!measureDivRef.current) {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.visibility = 'hidden';
      div.style.pointerEvents = 'none';
      div.setAttribute('aria-hidden', 'true');
      document.body.appendChild(div);
      measureDivRef.current = div;
    }

    if (!content || mentions.length === 0) {
      canvasRef.current.width = 0;
      canvasRef.current.height = 0;
      textarea.style.backgroundImage = '';
      textarea.style.backgroundRepeat = '';
      textarea.style.backgroundSize = '';
      textarea.style.backgroundPosition = '';
      return;
    }

    try {
      measureAndPaint(
        canvasRef.current,
        textarea,
        content,
        mentionSet,
        measureDivRef.current,
      );

      // Set the painted canvas as the textarea's background.
      // The background scrolls naturally with the textarea content.
      textarea.style.backgroundImage = `url(${canvasRef.current.toDataURL()})`;
      textarea.style.backgroundRepeat = 'no-repeat';
      textarea.style.backgroundSize = `${textarea.clientWidth}px ${textarea.scrollHeight}px`;
      textarea.style.backgroundPosition = `${-textarea.scrollLeft}px ${-textarea.scrollTop}px`;
    } catch (err) {
      console.warn('Failed to paint mention highlights:', err);
    }
  }, [textareaRef, content, mentions, mentionSet]);

  useEffect(() => {
    if (
      content === prevContentRef.current &&
      mentions.length === prevMentionsRef.current.length &&
      mentions.every((m, i) => m === prevMentionsRef.current[i])
    ) {
      return;
    }

    prevContentRef.current = content;
    prevMentionsRef.current = [...mentions];

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      repaint();
    });
  }, [content, mentions, repaint]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const observer = new ResizeObserver(() => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        repaint();
      });
    });

    observer.observe(textarea);

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [textareaRef, repaint]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const onScroll = () => {
      textarea.style.backgroundPosition = `${-textarea.scrollLeft}px ${-textarea.scrollTop}px`;
    };

    textarea.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      textarea.removeEventListener('scroll', onScroll);
    };
  }, [textareaRef]);

  useEffect(() => {
    return () => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.backgroundImage = '';
        textarea.style.backgroundRepeat = '';
        textarea.style.backgroundSize = '';
        textarea.style.backgroundPosition = '';
      }
      if (measureDivRef.current) {
        document.body.removeChild(measureDivRef.current);
        measureDivRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [textareaRef]);
}
