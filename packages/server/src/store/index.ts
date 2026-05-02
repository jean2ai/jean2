import { Database } from 'bun:sqlite';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

import { resolveDatabasePath } from '@/config';

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

  // =============================================================================
  // Legacy `tool_permissions` Table (DEPRECATED — read-only, kept for migration)
  //
  // This table is no longer written to by runtime code.
  // It is preserved for backward compatibility with databases that have legacy data.
  // The canonical permission table is `permission_grants` (defined below).
  //
  // Do NOT add new readers or writers for this table.
  // =============================================================================
  db.run(`
    CREATE TABLE IF NOT EXISTS tool_permissions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      permission_type TEXT NOT NULL,
      permission_key TEXT NOT NULL,
      allowed INTEGER NOT NULL,
      granted_at TEXT NOT NULL,
      granted_by TEXT,
      revoked_at TEXT,
      revoked_by TEXT,
      expires_at TEXT,
      scope TEXT,
      duration TEXT,
      metadata TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);

  // Migration: add new columns if they don't exist (for existing databases)
  const addColumnIfNotExists = (table: string, column: string, type: string) => {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (_e: unknown) {
      // Column may already exist
    }
  };

  addColumnIfNotExists('tool_permissions', 'expires_at', 'TEXT');
  addColumnIfNotExists('tool_permissions', 'scope', 'TEXT');
  addColumnIfNotExists('tool_permissions', 'duration', 'TEXT');

  // Migration: rename permission_type column to resource in permission_grants
  // This fixes the schema/query mismatch between the canonical PermissionResource type
  // and the old column name. Must run before any queries use the 'resource' column name.
  try {
    // Check if old column exists and new column doesn't
    const columns = db.query("PRAGMA table_info(permission_grants)").all() as { name: string }[];
    const columnNames = new Set(columns.map(c => c.name));
    if (columnNames.has('permission_type') && !columnNames.has('resource')) {
      db.run('ALTER TABLE permission_grants ADD COLUMN resource TEXT');
      // Migrate data from permission_type to resource
      db.run('UPDATE permission_grants SET resource = permission_type WHERE resource IS NULL');
    }
  } catch (_e: unknown) {
    // Migration may have already been applied or table doesn't exist yet
  }

  // Index for fast permission lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_permissions_lookup
    ON tool_permissions(workspace_id, tool_name, permission_type, permission_key, allowed, revoked_at)`);

  // Index for listing workspace permissions
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_permissions_workspace
    ON tool_permissions(workspace_id, revoked_at)`);

  // Index for history queries
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_permissions_history
    ON tool_permissions(workspace_id, granted_at)`);

  // =============================================================================
  // New Structured Permission Grants Table
  // =============================================================================

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

  // Phase 1 Migration: add action column to permission_grants for resource-target semantics
  // e.g. resource='file', action='read' | 'write' | 'delete'; resource='network', action='request'
  addColumnIfNotExists('permission_grants', 'action', 'TEXT');

  // Migration: add bound_root_session_id for session-scoped grant isolation
  // Session-scoped grants are only valid within the root session they were created in.
  addColumnIfNotExists('permission_grants', 'bound_root_session_id', 'TEXT');

  db.run(`
    CREATE TABLE IF NOT EXISTS pending_asks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      ask_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_session ON pending_asks(session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_tool_call ON pending_asks(tool_call_id)');

  // =============================================================================
  // Phase 1 Migration: Evolve pending_asks into durable permission request storage
  //
  // New columns:
  //   request_id       — dedicated per-ask identity (UUID), separate from toolCallId
  //   workspace_id     — workspace context for the ask
  //   root_session_id  — root session for hierarchy traversal
  //   origin_session_id— original session (differs from session_id for child asks)
  //   status           — lifecycle: pending | approved | denied | expired | cancelled
  //   expires_at       — absolute timestamp when the request expires
  //   resolved_at      — when the request was resolved
  //   resolution_json  — JSON payload of the resolution (grant scope, etc.)
  //   is_permission    — flag: 1 = permission ask, 0 = generic ask
  // =============================================================================

  const pendingAsksColumns = new Set(
    (db.query('PRAGMA table_info(pending_asks)').all() as { name: string }[]).map(c => c.name),
  );

  if (!pendingAsksColumns.has('request_id')) {
    db.run('ALTER TABLE pending_asks ADD COLUMN request_id TEXT');
  }
  if (!pendingAsksColumns.has('workspace_id')) {
    db.run('ALTER TABLE pending_asks ADD COLUMN workspace_id TEXT');
  }
  if (!pendingAsksColumns.has('root_session_id')) {
    db.run('ALTER TABLE pending_asks ADD COLUMN root_session_id TEXT');
  }
  if (!pendingAsksColumns.has('origin_session_id')) {
    db.run('ALTER TABLE pending_asks ADD COLUMN origin_session_id TEXT');
  }
  if (!pendingAsksColumns.has('status')) {
    db.run("ALTER TABLE pending_asks ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
  }
  if (!pendingAsksColumns.has('expires_at')) {
    db.run('ALTER TABLE pending_asks ADD COLUMN expires_at INTEGER');
  }
  if (!pendingAsksColumns.has('resolved_at')) {
    db.run('ALTER TABLE pending_asks ADD COLUMN resolved_at INTEGER');
  }
  if (!pendingAsksColumns.has('resolution_json')) {
    db.run('ALTER TABLE pending_asks ADD COLUMN resolution_json TEXT');
  }
  if (!pendingAsksColumns.has('is_permission')) {
    db.run('ALTER TABLE pending_asks ADD COLUMN is_permission INTEGER NOT NULL DEFAULT 0');
  }

  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_request_id ON pending_asks(request_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_status ON pending_asks(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_root_session ON pending_asks(root_session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_pending_asks_workspace ON pending_asks(workspace_id)');

  // Migration: drop orphaned tool_approvals table (superseded by ask system)
  try {
    db.run('DROP TABLE IF EXISTS tool_approvals');
  } catch (_e: unknown) {
    // Table may not exist
  }

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

  try {
    db.run(`ALTER TABLE queued_messages ADD COLUMN attachments TEXT`);
  } catch (_e: unknown) {
    // Column may already exist
  }

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
