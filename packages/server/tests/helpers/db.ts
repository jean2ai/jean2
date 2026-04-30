import { Database } from 'bun:sqlite';
import { initializeSchema, setDatabaseForTesting, resetDatabaseForTesting } from '@/store';

/**
 * Create a fresh in-memory SQLite database with full schema initialized.
 * Each call returns a new, isolated DB — no cross-test contamination.
 *
 * Usage:
 *   const db = createTestDatabase();
 *   // ... use store functions that call getDatabase() ...
 *   db.close();
 */
export function createTestDatabase(): Database {
  const db = new Database(':memory:');
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  initializeSchema(db);
  return db;
}

/**
 * Set up an in-memory database as the active store singleton.
 * Call this in beforeEach(). Call resetTestDatabase() in afterEach().
 *
 * Usage:
 *   beforeEach(() => setupTestDatabase());
 *   afterEach(() => resetTestDatabase());
 */
export function setupTestDatabase(): Database {
  const db = createTestDatabase();
  setDatabaseForTesting(db);
  return db;
}

/**
 * Tear down the test database singleton.
 * Call this in afterEach() to prevent leaks.
 */
export function resetTestDatabase(): void {
  resetDatabaseForTesting();
}
