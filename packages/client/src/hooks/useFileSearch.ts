import { useState, useCallback } from 'react';
import type { FileEntry } from '@jean2/sdk';

interface UseFileSearchOptions {
  workspaceId: string;
  debounceMs?: number;
}

interface FileMention {
  type: 'file';
  path: string;
  display: string;
}

export function useFileSearch({ workspaceId: _workspaceId, debounceMs: _debounceMs = 150 }: UseFileSearchOptions) {
  const [query, setQuery] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [mentions, setMentions] = useState<FileMention[]>([]);

  const handleFileSelect = useCallback((file: FileEntry) => {
    const mention: FileMention = {
      type: 'file',
      path: file.path,
      display: file.name,
    };

    setMentions(prev => [...prev, mention]);
    setShowAutocomplete(false);
    setQuery('');

    return mention;
  }, []);

  const insertMention = useCallback((text: string, cursorPos: number, mention: FileMention) => {
    const beforeMention = text.lastIndexOf('@', cursorPos);
    if (beforeMention === -1) return { text, cursorPos };

    const newText =
      text.slice(0, beforeMention) +
      `@${mention.path}` +
      text.slice(cursorPos);

    const newCursorPos = beforeMention + mention.path.length + 1;

    return { text: newText, cursorPos: newCursorPos };
  }, []);

  const extractMentions = useCallback((text: string): FileMention[] => {
    const mentionRegex = /@([^\s@]+)/g;
    const extracted: FileMention[] = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      const path = match[1];
      if (mentions.some(m => m.path === path) && !extracted.some(m => m.path === path)) {
        extracted.push({ type: 'file', path, display: path.split('/').pop() || path });
      }
    }

    return extracted;
  }, [mentions]);

  return {
    query,
    setQuery,
    showAutocomplete,
    setShowAutocomplete,
    mentions,
    handleFileSelect,
    insertMention,
    extractMentions,
  };
}

export type { FileMention };
