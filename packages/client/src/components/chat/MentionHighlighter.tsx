import { useEffect, useMemo, useRef } from 'react';

interface MentionHighlighterProps {
  content: string;
  mentions: string[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

interface TextSegment {
  type: 'text' | 'mention';
  value: string;
  path?: string;
}

export function MentionHighlighter({ content, mentions, textareaRef }: MentionHighlighterProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);

  const segments = useMemo((): TextSegment[] => {
    if (!content) return [];

    const mentionSet = new Set(mentions);
    const regex = /@([^\s@]+)/g;
    const result: TextSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const path = match[1];
      if (mentionSet.has(path)) {
        if (match.index > lastIndex) {
          result.push({
            type: 'text',
            value: content.slice(lastIndex, match.index),
          });
        }
        result.push({
          type: 'mention',
          value: match[0],
          path,
        });
        lastIndex = match.index + match[0].length;
      }
    }

    if (lastIndex < content.length) {
      result.push({
        type: 'text',
        value: content.slice(lastIndex),
      });
    }

    return result;
  }, [content, mentions]);

  useEffect(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;

    const sync = () => {
      mirror.style.height = `${textarea.offsetHeight}px`;
      mirror.scrollTop = textarea.scrollTop;
      mirror.scrollLeft = textarea.scrollLeft;
    };

    sync();
    textarea.addEventListener('scroll', sync);
    const observer = new ResizeObserver(sync);
    observer.observe(textarea);

    return () => {
      textarea.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, [textareaRef]);

  const renderContent = () => {
    return segments.map((segment, index) => {
      if (segment.type === 'mention' && segment.path) {
        return (
          <span
            key={index}
            className="mention-highlight"
            data-mention-path={segment.path}
          >
            {segment.value}
          </span>
        );
      }
      return <span key={index}>{segment.value}</span>;
    });
  };

  return (
    <div
      ref={mirrorRef}
      className="mirror-textarea"
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 0,
        color: 'var(--foreground)',
        fontFamily: 'inherit',
        fontSize: '0.875rem',
        lineHeight: '1.25rem',
        letterSpacing: 'normal',
        padding: '0.5rem 0.625rem',
        paddingRight: '3rem',
        minHeight: '44px',
        border: '1px solid transparent',
        borderRadius: '0.5rem',
        maxHeight: '150px',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        wordBreak: 'break-word',
        boxSizing: 'border-box',
        backgroundColor: 'transparent',
      }}
    >
      {renderContent()}
    </div>
  );
}
