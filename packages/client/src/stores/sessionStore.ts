import { useSessionListStore } from './sessionListStore';
import { useActiveSessionStore } from './activeSessionStore';

// Backward-compat re-exports — new code should import from the specific stores
export { useSessionListStore };
export { useActiveSessionStore };

// Utility for clearing both stores at once (replaces old clearSessionState)
export function clearSessionState() {
  useSessionListStore.getState().clearSessions();
  useActiveSessionStore.getState().clearActiveSession();
}