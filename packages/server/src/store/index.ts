import { Database } from 'bun:sqlite';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

import { resolveDatabasePath } from '@/config';
import { seedBuiltinResponseFormats } from './response-formats';
import { initializeFts } from '@/session-search/fts';

/**
 * Database Singleton
 *
 * All database access is resolved through a singleton DB instance.
 * In production, the database is lazily created from the resolved path.
 * It can be overridden via:
 *   - DB.configure({ database }) (e.g. for CLI --database flag, or tests)
 *
 * Usage:
 *   import { getDatabase } from '@/store';
 *   const db = getDatabase();
 *
 * Override (generic — not test-specific):
 *   import { DB } from '@/store';
 *   DB.configure({ database: myDb });
 *   DB.reset();
 */
class DatabaseSingleton {
  private dbOverride: Database | null = null;
  private dbDefault: Database | null = null;

  /**
   * Configure the database instance directly.
   * Useful for injecting an in-memory database or a pre-opened connection.
   */
  configure(opts: { database: Database }): void {
    // Close any previous override if it's different
    if (this.dbOverride && this.dbOverride !== opts.database) {
      this.dbOverride.close();
    }
    this.dbOverride = opts.database;
  }

  /**
   * Reset all overrides. Closes the override database if one was set.
   * The lazily-created default database is kept alive (call close() separately if needed).
   */
  reset(): void {
    if (this.dbOverride) {
      this.dbOverride.close();
      this.dbOverride = null;
    }
  }

  /**
   * Close all database connections and reset state completely.
   */
  close(): void {
    if (this.dbOverride) {
      this.dbOverride.close();
      this.dbOverride = null;
    }
    if (this.dbDefault) {
      this.dbDefault.close();
      this.dbDefault = null;
    }
  }

  /**
   * Get the active database instance.
   * Priority:
   *   1. Programmatic override (set via configure)
   *   2. Lazily-created default from resolved path
   */
  getDatabase(): Database {
    if (this.dbOverride) {
      return this.dbOverride;
    }

    if (!this.dbDefault) {
      const dbPath = resolveDatabasePath();
      const dbDir = dirname(dbPath);
      mkdirSync(dbDir, { recursive: true });

      const db = new Database(dbPath);
      db.run('PRAGMA journal_mode = WAL');
      initializeSchema(db);
      this.dbDefault = db;
    }

    return this.dbDefault;
  }
}

/**
 * Singleton instance. Use DB.configure() / DB.reset() to override.
 */
export const DB = new DatabaseSingleton();

/**
 * Get the active database instance.
 * Convenience free function backed by the singleton.
 */
export function getDatabase(): Database {
  return DB.getDatabase();
}

/**
 * Close all database connections and reset state.
 * Convenience free function backed by the singleton.
 */
export function closeDatabase(): void {
  DB.close();
}

// Force run migrations on the current database
export function runMigrations(): void {
  const database = getDatabase();
  initializeSchema(database);
  console.log('Migrations completed successfully');
}

export function initializeSchema(db: Database): void {
  // Drop legacy tables from the stable release that are no longer used
  db.run('DROP TABLE IF EXISTS tool_permissions');
  db.run('DROP TABLE IF EXISTS tool_approvals');

  db.run(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      is_virtual INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS workspace_paths (
      workspace_id TEXT NOT NULL,
      path TEXT NOT NULL,
      label TEXT,
      PRIMARY KEY (workspace_id, path),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      preconfig_id TEXT,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata TEXT,
      selected_model TEXT,
      selected_provider TEXT,
      selected_variant TEXT,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      parent_id TEXT,
      agent_name TEXT,
      subagent_status TEXT,
      running_at TEXT,
      compacting INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)');

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,

      -- Assistant-only fields (NULL for user/system)
      status TEXT,
      model_id TEXT,
      provider_id TEXT,
      agent TEXT,
      tokens_prompt INTEGER DEFAULT 0,
      tokens_completion INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      completed_at INTEGER,
      error TEXT,

      -- Compaction metadata (on assistant messages)
      summary INTEGER DEFAULT 0,
      mode TEXT,
      parent_id TEXT,

      -- Structured output (when response format was used)
      structured_output TEXT,

      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_session_status ON messages(session_id, status) WHERE status = \'streaming\'');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_summary ON messages(session_id, summary) WHERE summary = 1');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id)');

  db.run(`
    CREATE TABLE IF NOT EXISTS parts (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,

      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_parts_message ON parts(message_id, created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_parts_session ON parts(session_id, created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_parts_type ON parts(type)');

  db.run(`CREATE TABLE IF NOT EXISTS permission_grants (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'persistent',
    matcher TEXT NOT NULL DEFAULT 'exact',
    pattern TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    resource TEXT NOT NULL,
    action TEXT,
    allowed INTEGER NOT NULL,
    granted_at TEXT NOT NULL,
    expires_at TEXT,
    granted_by TEXT,
    revoked_at TEXT,
    revoked_by TEXT,
    metadata TEXT,
    bound_root_session_id TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_permission_grants_lookup
    ON permission_grants(workspace_id, tool_name, resource, revoked_at)`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_permission_grants_workspace
    ON permission_grants(workspace_id, revoked_at)`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_permission_grants_pattern
    ON permission_grants(workspace_id, tool_name, pattern)`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_permission_grants_scope
    ON permission_grants(workspace_id, scope, granted_by)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS pending_asks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      ask_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      request_id TEXT,
      workspace_id TEXT,
      root_session_id TEXT,
      origin_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at INTEGER,
      resolved_at INTEGER,
      resolution_json TEXT,
      is_permission INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_session ON pending_asks(session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_tool_call ON pending_asks(tool_call_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_request_id ON pending_asks(request_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_status ON pending_asks(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_root_session ON pending_asks(root_session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_workspace ON pending_asks(workspace_id)');

  db.run(`
    CREATE TABLE IF NOT EXISTS queued_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      content TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      attachments TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_queued_messages_session ON queued_messages(session_id, position)');

  db.run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      absolute_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      access_key TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_id)');

  db.run(`
    CREATE TABLE IF NOT EXISTS terminal_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      cwd TEXT NOT NULL,
      shell TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'main',
      status TEXT NOT NULL DEFAULT 'running',
      exit_code INTEGER,
      pid INTEGER,
      cols INTEGER NOT NULL DEFAULT 80,
      rows INTEGER NOT NULL DEFAULT 24,
      created_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL,
      destroyed_at INTEGER,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_terminal_sessions_workspace ON terminal_sessions(workspace_id, status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_terminal_sessions_activity ON terminal_sessions(last_activity_at)');

  db.run(`
    CREATE TABLE IF NOT EXISTS response_formats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      schema TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_response_formats_name ON response_formats(name)');

  db.run(`
    CREATE TABLE IF NOT EXISTS pinned_messages (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,

      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,

      UNIQUE(workspace_id, message_id)
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_pinned_messages_workspace_created ON pinned_messages(workspace_id, created_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pinned_messages_session ON pinned_messages(session_id)');

  db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_kind TEXT NOT NULL,
      schedule_config TEXT NOT NULL,
      schedule_display TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'active',
      repeat_limit INTEGER,
      run_count INTEGER NOT NULL DEFAULT 0,
      next_run_at INTEGER,
      last_run_at INTEGER,
      last_run_session_id TEXT,
      last_error TEXT,
      reuse_session INTEGER NOT NULL DEFAULT 0,
      include_history INTEGER NOT NULL DEFAULT 0,
      preconfig_id TEXT,
      origin_session_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_workspace ON scheduled_jobs(workspace_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(state, next_run_at)');

  // Seed built-in response formats
  seedBuiltinResponseFormats(db);

  // Migrate: add reuse_session column to scheduled_jobs if missing
  try {
    db.run('ALTER TABLE scheduled_jobs ADD COLUMN reuse_session INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists
  }

  // Migrate: add include_history column to scheduled_jobs if missing
  try {
    db.run('ALTER TABLE scheduled_jobs ADD COLUMN include_history INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists
  }

  // Migrate: add structured_output column to messages if missing
  try {
    db.run('ALTER TABLE messages ADD COLUMN structured_output TEXT');
  } catch {
    // Column already exists
  }

  // Migrate: add settings column to workspaces if missing
  try {
    db.run('ALTER TABLE workspaces ADD COLUMN settings TEXT DEFAULT "{}"');
  } catch {
    // Column already exists
  }

  // Migrate: add tags column to sessions if missing
  try {
    db.run("ALTER TABLE sessions ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  } catch {
    // Column already exists
  }

  // Migrate: add auto_approve_severity column to sessions if missing
  try {
    db.run('ALTER TABLE sessions ADD COLUMN auto_approve_severity TEXT');
  } catch {
    // Column already exists
  }

  // Initialize FTS table for session search
  initializeFts(db);
}

export { Database };

// Re-export all store modules
export * from './sessions';
export * from './messages';
export * from './workspaces';
export * from './permissions';
export * from './queued-messages';
export * from './terminal-sessions';

// Re-export session cleanup functions for workspace deletion
export { cleanupSessionOutputDir, cleanupSessionsOutputDirs, cleanupWorkspaceSessionsOutputDirs, deleteSessionsByWorkspace } from './sessions';

// Re-export for recovery functions
export { findOrphanedCompactionTriggers } from './messages';
export { reconcileSessionCompaction, reconcileAllSessionsCompaction } from './compaction-recovery';

// Re-export attachment functions
export * from './attachments';
export { deleteAttachmentsForSession, deleteAttachmentsForWorkspace, getAttachment } from './attachments';

// Re-export pending asks functions
export * from './pending-asks';
export * from './response-formats';
export * from './pinned-messages';

// Re-export cleanup
export { cleanupOrphanedData } from './cleanup';
export type { CleanupStats } from './cleanup';

// Re-export scheduled jobs
export * from './scheduled-jobs';
