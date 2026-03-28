import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface TodoWriteInput {
  todos: Array<{
    content: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    priority?: 'high' | 'medium' | 'low';
  }>;
  workspacePath: string;
  sessionId: string;
}

interface TodoWriteOutput {
  success: boolean;
  count: number;
  error?: string;
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

type ValidStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
type ValidPriority = 'high' | 'medium' | 'low';

const VALID_STATUSES: ValidStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];
const VALID_PRIORITIES: ValidPriority[] = ['high', 'medium', 'low'];

function outputError(error: string): never {
  const output: TodoWriteOutput = { success: false, count: 0, error };
  console.log(JSON.stringify(output));
  process.exit(0);
}

function validateInput(input: unknown): TodoWriteInput {
  if (!input || typeof input !== 'object') {
    outputError('invalid input: expected object');
  }

  const data = input as { todos?: unknown; workspacePath?: unknown; sessionId?: unknown };

  if (!Array.isArray(data.todos)) {
    outputError('todos must be an array');
  }

  for (let i = 0; i < data.todos.length; i++) {
    const todo = data.todos[i] as { content?: unknown; status?: unknown; priority?: unknown };

    if (typeof todo.content !== 'string' || todo.content.trim() === '') {
      outputError('each todo must have content');
    }

    const status = todo.status as string;
    if (!VALID_STATUSES.includes(status as ValidStatus)) {
      outputError(`invalid status: ${status}. Must be one of: pending, in_progress, completed, cancelled`);
    }

    const priority = todo.priority as string | undefined;
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority as ValidPriority)) {
      outputError(`invalid priority: ${priority}. Must be one of: high, medium, low`);
    }
  }

  return input as TodoWriteInput;
}

async function main() {
  const inputText = await Bun.stdin.text();
  let input: unknown;

  try {
    input = JSON.parse(inputText);
  } catch {
    outputError('invalid JSON input');
  }

  const { todos, workspacePath: _workspacePath, sessionId: sessionId } = validateInput(input);

  const dbPath = process.env.TODOS_DB_PATH || join(homedir(), '.jean2', 'data', 'todos.db');
  const dbDir = dbPath.substring(0, dbPath.lastIndexOf('/'));

  mkdirSync(dbDir, { recursive: true });

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

    db.run('DELETE FROM todos WHERE session_id = ?', [sessionId]);

    const now = Date.now();
    const insertStmt = db.prepare(
      'INSERT INTO todos (id, session_id, content, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    for (const todo of todos) {
      const id = crypto.randomUUID();
      const priority = todo.priority || 'medium';
      insertStmt.run(id, sessionId, todo.content, todo.status, priority, now, now);
    }

    const normalizedTodos = todos.map(todo => ({
      content: todo.content,
      status: todo.status,
      priority: todo.priority || 'medium',
    }));

    const output: TodoWriteOutput = {
      success: true,
      count: todos.length,
      _visualization: {
        type: 'todo-list',
        title: 'Todo List',
        items: normalizedTodos,
      },
    };
    console.log(JSON.stringify(output));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const output: TodoWriteOutput = { success: false, count: 0, error: message };
    console.log(JSON.stringify(output));
  } finally {
    db.close();
  }
}

main();
