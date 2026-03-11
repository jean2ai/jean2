import { Database } from 'bun:sqlite';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';

let db: Database | null = null;

export function getDatabase(): Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'agent.db');

    // Ensure the directory exists
    const dbDir = dirname(dbPath);
    mkdirSync(dbDir, { recursive: true });

    db = new Database(dbPath);
    // Enable WAL mode for better concurrency
    db.run('PRAGMA journal_mode = WAL');
    initializeSchema(db);
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function initializeSchema(db: Database): void {
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
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
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

      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_session_status ON messages(session_id, status) WHERE status = \'streaming\'');

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

  db.run(`
    CREATE TABLE IF NOT EXISTS tool_approvals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      child_session_id TEXT,
      subagent_name TEXT,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args TEXT NOT NULL,
      permission_type TEXT,
      permission_key TEXT,
      message TEXT,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT NOT NULL,
      responded_at TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_tool_approvals_session ON tool_approvals(session_id, status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_tool_approvals_tool_call ON tool_approvals(tool_call_id)');

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
      metadata TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);

  // Index for fast permission lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_permissions_lookup
    ON tool_permissions(workspace_id, tool_name, permission_type, permission_key, allowed, revoked_at)`);

  // Index for listing workspace permissions
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_permissions_workspace
    ON tool_permissions(workspace_id, revoked_at)`);

  // Index for history queries
  db.run(`CREATE INDEX IF NOT EXISTS idx_tool_permissions_history
    ON tool_permissions(workspace_id, granted_at)`);

  // Migration: Add parent_id and agent_name columns for subagent support
  const tableInfo = db.query("PRAGMA table_info(sessions)").all() as { name: string }[];
  const columnNames = tableInfo.map(row => row.name);

  if (!columnNames.includes('parent_id')) {
    console.log('Migrating: Adding parent_id column to sessions table');
    db.run('ALTER TABLE sessions ADD COLUMN parent_id TEXT');
  }

  if (!columnNames.includes('agent_name')) {
    console.log('Migrating: Adding agent_name column to sessions table');
    db.run('ALTER TABLE sessions ADD COLUMN agent_name TEXT');
  }

  if (!columnNames.includes('subagent_status')) {
    console.log('Migrating: Adding subagent_status column to sessions table');
    db.run('ALTER TABLE sessions ADD COLUMN subagent_status TEXT');
  }
}

export { Database };

// Re-export all store modules
export * from './sessions';
export * from './messages';
export * from './tool-approvals';
export * from './workspaces';
export * from './permissions';
