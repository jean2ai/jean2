import { Database } from 'bun:sqlite';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';

interface TodoReadInput {
  workspacePath: string;
  sessionId: string;
}

interface TodoReadOutput {
  todos: Array<{
    content: string;
    status: string;
    priority: string;
  }>;
  _visualization?: {
    type: 'todo-list';
    title?: string;
    items: Array<{
      content: string;
      status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
      priority: 'high' | 'medium' | 'low';
    }>;
  };
}

async function main(): Promise<void> {
  const inputText = await Bun.stdin.text();

  let input: TodoReadInput;
  try {
    input = JSON.parse(inputText);
  } catch {
    const output: TodoReadOutput = { todos: [] };
    console.log(JSON.stringify(output));
    return;
  }

  const { workspacePath: _workspacePath, sessionId: sessionId } = input;

  const TODOS_DB_PATH = process.env.TODOS_DB_PATH;
  const dbPath = TODOS_DB_PATH || join(homedir(), '.jean2', 'data', 'todos.db');

  const dbDir = join(dbPath, '..');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.run('PRAGMA journal_mode = WAL');

  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'medium',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_todos_session ON todos(session_id)');

    const query = db.query(`
      SELECT id, session_id, content, status, priority, created_at, updated_at
      FROM todos
      WHERE session_id = ?
      ORDER BY
        CASE priority
          WHEN 'high' THEN 0
          WHEN 'medium' THEN 1
          WHEN 'low' THEN 2
        END,
        created_at ASC
    `);

    const rows = query.all(sessionId) as Array<{
      id: string;
      session_id: string;
      content: string;
      status: string;
      priority: string;
      created_at: number;
      updated_at: number;
    }>;

    const output: TodoReadOutput = {
      todos: rows.map(row => ({
        content: row.content,
        status: row.status,
        priority: row.priority,
      })),
      _visualization: {
        type: 'todo-list',
        title: 'Todo List',
        items: rows.map(row => ({
          content: row.content,
          status: row.status as 'pending' | 'in_progress' | 'completed' | 'cancelled',
          priority: row.priority as 'high' | 'medium' | 'low',
        })),
      },
    };

    console.log(JSON.stringify(output));
  } finally {
    db.close();
  }
}

main();
