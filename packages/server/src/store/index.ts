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
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);
  
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)');

  db.run(`
    CREATE TABLE IF NOT EXISTS tool_executions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args TEXT NOT NULL,
      result TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tool_approvals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT NOT NULL,
      responded_at TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

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
}

export { Database };

// Re-export all store modules
export * from './sessions';
export * from './messages';
export * from './tool-executions';
export * from './tool-approvals';
export * from './workspaces';
export * from './permissions';
