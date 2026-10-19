import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  `CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'todo',
    date TEXT, time TEXT, end_time TEXT,
    location TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'normal',
    tags TEXT NOT NULL DEFAULT '[]',
    remind_min INTEGER,
    done INTEGER NOT NULL DEFAULT 0,
    done_at TEXT,
    source_image TEXT,
    source_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_tasks_date ON tasks(date);
  CREATE INDEX idx_tasks_done ON tasks(done, date);
  CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    teacher TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    weekday INTEGER NOT NULL,
    start_period INTEGER, end_period INTEGER,
    start_time TEXT, end_time TEXT,
    weeks TEXT NOT NULL DEFAULT '[]',
    source_image TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE images (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    mime TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE ai_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    kind TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER, output_tokens INTEGER,
    ok INTEGER NOT NULL
  );`,
];

export function openDb(dataDir, file = 'daily-hub.db') {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(file === ':memory:' ? file : path.join(dataDir, file));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}

/** Run fn inside a transaction; rolls back if it throws. */
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Tiny TTL cache on top of the cache table. */
export function createCache(db) {
  const getStmt = db.prepare('SELECT value, expires_at FROM cache WHERE key = ?');
  const setStmt = db.prepare('INSERT INTO cache(key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at');
  return {
    /** Returns { value, fresh } or null. Stale entries stay readable as a fallback. */
    get(key) {
      const row = getStmt.get(key);
      return row ? { value: JSON.parse(row.value), fresh: row.expires_at > Date.now() } : null;
    },
    set(key, value, ttlMs) {
      setStmt.run(key, JSON.stringify(value), Date.now() + ttlMs);
    },
  };
}
