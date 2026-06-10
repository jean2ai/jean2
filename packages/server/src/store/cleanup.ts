import { getDatabase } from './index';
import { removeSessionFromFts } from '@/session-search/fts';

export interface CleanupStats {
  orphanedParts: number;
  orphanedMessages: number;
  orphanedPendingAsks: number;
  orphanedQueuedMessages: number;
  orphanedAttachments: number;
  orphanedPinnedMessages: number;
  orphanedSessions: number;
  orphanedPermissionGrants: number;
  orphanedWorkspacePaths: number;
  orphanedTerminalSessions: number;
  orphanedFtsRows: number;
}

export function cleanupOrphanedData(): CleanupStats {
  const db = getDatabase();
  const stats: CleanupStats = {
    orphanedParts: 0,
    orphanedMessages: 0,
    orphanedPendingAsks: 0,
    orphanedQueuedMessages: 0,
    orphanedAttachments: 0,
    orphanedPinnedMessages: 0,
    orphanedSessions: 0,
    orphanedPermissionGrants: 0,
    orphanedWorkspacePaths: 0,
    orphanedTerminalSessions: 0,
    orphanedFtsRows: 0,
  };

  db.transaction(() => {
    // 1. Parts whose message doesn't exist
    stats.orphanedParts = db.run(
      `DELETE FROM parts WHERE message_id NOT IN (SELECT id FROM messages)`,
    ).changes;

    // 2. Parts whose session doesn't exist
    stats.orphanedParts += db.run(
      `DELETE FROM parts WHERE session_id NOT IN (SELECT id FROM sessions)`,
    ).changes;

    // 3. Messages whose session doesn't exist
    const orphanedMsgSessionIds = db.query(
      `SELECT DISTINCT session_id FROM messages WHERE session_id NOT IN (SELECT id FROM sessions)`,
    ).all() as { session_id: string }[];

    stats.orphanedMessages = db.run(
      `DELETE FROM messages WHERE session_id NOT IN (SELECT id FROM sessions)`,
    ).changes;

    // Clean FTS for orphaned sessions
    for (const { session_id } of orphanedMsgSessionIds) {
      try {
        removeSessionFromFts(session_id);
      } catch { /* best effort */ }
    }

    // 4. Pending asks whose session doesn't exist
    stats.orphanedPendingAsks = db.run(
      `DELETE FROM pending_asks WHERE session_id NOT IN (SELECT id FROM sessions)`,
    ).changes;

    // 5. Queued messages whose session doesn't exist
    stats.orphanedQueuedMessages = db.run(
      `DELETE FROM queued_messages WHERE session_id NOT IN (SELECT id FROM sessions)`,
    ).changes;

    // 6. Attachments whose session doesn't exist
    stats.orphanedAttachments = db.run(
      `DELETE FROM attachments WHERE session_id NOT IN (SELECT id FROM sessions)`,
    ).changes;

    // 7. Pinned messages whose session doesn't exist
    stats.orphanedPinnedMessages = db.run(
      `DELETE FROM pinned_messages WHERE session_id NOT IN (SELECT id FROM sessions)`,
    ).changes;

    // 8. Sessions whose workspace doesn't exist
    const orphanedSessionIds = db.query(
      `SELECT id FROM sessions WHERE workspace_id NOT IN (SELECT id FROM workspaces)`,
    ).all() as { id: string }[];

    stats.orphanedSessions = db.run(
      `DELETE FROM sessions WHERE workspace_id NOT IN (SELECT id FROM workspaces)`,
    ).changes;

    for (const { id } of orphanedSessionIds) {
      try {
        removeSessionFromFts(id);
      } catch { /* best effort */ }
    }

    // 9. Permission grants whose workspace doesn't exist
    stats.orphanedPermissionGrants = db.run(
      `DELETE FROM permission_grants WHERE workspace_id NOT IN (SELECT id FROM workspaces)`,
    ).changes;

    // 10. Workspace paths whose workspace doesn't exist
    stats.orphanedWorkspacePaths = db.run(
      `DELETE FROM workspace_paths WHERE workspace_id NOT IN (SELECT id FROM workspaces)`,
    ).changes;

    // 11. Terminal sessions whose workspace doesn't exist
    stats.orphanedTerminalSessions = db.run(
      `DELETE FROM terminal_sessions WHERE workspace_id NOT IN (SELECT id FROM workspaces)`,
    ).changes;

    // 12. FTS rows whose session doesn't exist
    stats.orphanedFtsRows = db.run(
      `DELETE FROM messages_fts WHERE session_id NOT IN (SELECT id FROM sessions)`,
    ).changes;
  })();

  return stats;
}
