import { create } from 'zustand';
import type { QueuedMessage } from '@jean2/sdk';

interface MessageQueueState {
  queuedMessages: Record<string, QueuedMessage[]>;
}

interface MessageQueueActions {
  clearQueuedMessages: () => void;
  setQueuedMessagesForSession: (sessionId: string, messages: QueuedMessage[]) => void;
  addQueuedMessage: (sessionId: string, message: QueuedMessage) => void;
  removeQueuedMessageById: (sessionId: string, queueId: string) => void;
  removeQueuedMessagesByIds: (sessionId: string, queueIds: string[]) => void;
}

type MessageQueueStore = MessageQueueState & MessageQueueActions;

export const useMessageQueueStore = create<MessageQueueStore>((set) => ({
  queuedMessages: {},

  clearQueuedMessages: () => set({ queuedMessages: {} }),

  setQueuedMessagesForSession: (sessionId, messages) =>
    set((state) => ({
      queuedMessages: { ...state.queuedMessages, [sessionId]: messages },
    })),

  addQueuedMessage: (sessionId, message) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: [...(state.queuedMessages[sessionId] || []), message],
      },
    })),

  removeQueuedMessageById: (sessionId, queueId) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: (state.queuedMessages[sessionId] || []).filter((q) => q.id !== queueId),
      },
    })),

  removeQueuedMessagesByIds: (sessionId, queueIds) =>
    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionId]: (state.queuedMessages[sessionId] || []).filter((q) => !queueIds.includes(q.id)),
      },
    })),
}));
