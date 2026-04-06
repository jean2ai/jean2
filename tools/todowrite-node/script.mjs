import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

function readStdin() {
  const chunks = [];
  const stdin = process.stdin;
  return new Promise((resolve, reject) => {
    stdin.on('data', (chunk) => chunks.push(chunk));
    stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
    stdin.on('error', reject);
  });
}

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];

function outputError(error) {
  const output = { success: false, count: 0, error };
  console.log(JSON.stringify(output));
  process.exit(0);
}

function validateInput(input) {
  if (!input || typeof input !== 'object') {
    outputError('invalid input: expected object');
  }

  const data = input;

  if (!Array.isArray(data.todos)) {
    outputError('todos must be an array');
  }

  for (let i = 0; i < data.todos.length; i++) {
    const todo = data.todos[i];

    if (typeof todo.content !== 'string' || todo.content.trim() === '') {
      outputError('each todo must have content');
    }

    const status = todo.status;
    if (!VALID_STATUSES.includes(status)) {
      outputError(`invalid status: ${status}. Must be one of: pending, in_progress, completed, cancelled`);
    }

    const priority = todo.priority;
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
      outputError(`invalid priority: ${priority}. Must be one of: high, medium, low`);
    }
  }

  return input;
}

async function main() {
  const inputText = await readStdin();
  let input;

  try {
    input = JSON.parse(inputText);
  } catch {
    outputError('invalid JSON input');
  }

  const { todos, workspacePath: _workspacePath, sessionId: sessionId } = validateInput(input);

  if (!sessionId || !_workspacePath) {
    outputError('Missing required sessionId or workspacePath');
  }

  const dbPath = process.env.TODOS_DB_PATH || join(homedir(), '.jean2', 'data', 'todos.db');
  const dbDir = dirname(dbPath);

  mkdirSync(dbDir, { recursive: true });

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

    db.prepare('DELETE FROM todos WHERE session_id = ?').run(sessionId);

    const now = Date.now();
    const insertStmt = db.prepare(
      'INSERT INTO todos (id, session_id, content, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    for (const todo of todos) {
      const id = randomUUID();
      const priority = todo.priority || 'medium';
      insertStmt.run(id, sessionId, todo.content, todo.status, priority, now, now);
    }

    const normalizedTodos = todos.map(todo => ({
      content: todo.content,
      status: todo.status,
      priority: todo.priority || 'medium',
    }));

    const output = {
      success: true,
      count: todos.length,
      _visualization: {
        type: 'todo-list',
        title: 'Todo List',
        items: normalizedTodos,
      },
    };
    console.log(JSON.stringify(output));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const output = { success: false, count: 0, error: message };
    console.log(JSON.stringify(output));
  } finally {
    db.close();
  }
}

main();
