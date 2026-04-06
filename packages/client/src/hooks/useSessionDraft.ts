import { useState, useEffect, useRef, useCallback } from 'react';
import { saveDraft, loadDraft, clearDraft, cleanupExpiredDrafts } from '@/config/draftStorage';

export function useSessionDraft(sessionId: string | undefined): {
  input: string;
  setInput: (value: string) => void;
  clearInput: () => void;
} {
  const [input, setInputState] = useState<string>('');
  const prevSessionIdRef = useRef<string | undefined>(undefined);
  const inputRef = useRef<string>('');

  useEffect(() => {
    cleanupExpiredDrafts();
  }, []);

  const setInput = useCallback(
    (value: string) => {
      setInputState(value);
      inputRef.current = value;
      if (sessionId !== undefined) {
        if (value === '') {
          clearDraft(sessionId);
        } else {
          saveDraft(sessionId, value);
        }
      }
    },
    [sessionId],
  );

  const clearInput = useCallback(() => {
    setInputState('');
    inputRef.current = '';
    if (sessionId !== undefined) {
      clearDraft(sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    const prevSessionId = prevSessionIdRef.current;

    if (prevSessionId !== undefined && prevSessionId !== sessionId) {
      const currentText = inputRef.current;
      if (currentText !== '') {
        saveDraft(prevSessionId, currentText);
      }
    }

    if (sessionId !== undefined) {
      const draft = loadDraft(sessionId);
      inputRef.current = draft;
      setInputState(draft);
    } else {
      inputRef.current = '';
      setInputState('');
    }

    prevSessionIdRef.current = sessionId;
  }, [sessionId]);

  return { input, setInput, clearInput };
}
