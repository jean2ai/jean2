import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';

function readStdin() {
  const chunks = [];
  const stdin = process.stdin;
  return new Promise((resolve, reject) => {
    stdin.on('data', (chunk) => chunks.push(chunk));
    stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
    stdin.on('error', reject);
  });
}

async function main() {
  const inputText = await readStdin();

  let input;
  try {
    input = JSON.parse(inputText);
  } catch {
    const output = { todos: [] };
    console.log(JSON.stringify(output));
    return;
  }

  const { workspacePath: _workspacePath, sessionId: sessionId } = input;

  if (!sessionId || !_workspacePath) {
    console.log(JSON.stringify({
      todos: [],
      error: 'Missing required sessionId or workspacePath',
    }));
    return;
  }

  const TODOS_DB_PATH = process.env.TODOS_DB_PATH;
  const dbPath = TODOS_DB_PATH || join(homedir(), '.jean2', 'data', 'todos.db');

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  try {
    db.exec(`
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
    db.exec('CREATE INDEX IF NOT EXISTS idx_todos_session ON todos(session_id)');

    const stmt = db.prepare(`
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

    const rows = stmt.all(sessionId);

    const output = {
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
          status: row.status,
          priority: row.priority,
        })),
      },
    };

    console.log(JSON.stringify(output));
  } finally {
    db.close();
  }
}

main();
