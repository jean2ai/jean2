import { useCallback, useRef } from 'react';
import chatFinishSound from '@/assets/sounds/chat-finish.mp3';
import chatPermissionSound from '@/assets/sounds/chat-permission.mp3';

export function useNotificationSound() {
  const chatFinishAudioRef = useRef<HTMLAudioElement | null>(null);
  const permissionAudioRef = useRef<HTMLAudioElement | null>(null);

  const playChatFinishSound = useCallback(() => {
    try {
      if (!chatFinishAudioRef.current) {
        chatFinishAudioRef.current = new Audio(chatFinishSound);
      }

      const audio = chatFinishAudioRef.current;
      audio.currentTime = 0;
      audio.play().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.debug('Could not play notification sound:', message);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.debug('Error initializing notification sound:', message);
    }
  }, []);

  const playPermissionSound = useCallback(() => {
    try {
      if (!permissionAudioRef.current) {
        permissionAudioRef.current = new Audio(chatPermissionSound);
      }

      const audio = permissionAudioRef.current;
      audio.currentTime = 0;
      audio.play().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.debug('Could not play permission sound:', message);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.debug('Error initializing permission sound:', message);
    }
  }, []);

  return { playChatFinishSound, playPermissionSound };
}
