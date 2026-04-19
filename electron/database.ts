import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH } from './config';

let db: Database.Database | null = null;

// 获取或创建 SQLite 数据库实例（单例模式），自动初始化表结构和迁移
export function getDb(): Database.Database {
  if (db) return db;

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(
    process.env.NODE_ENV === 'development'
      ? path.join(__dirname, '..', '..', 'database', 'schema.sql')
      : path.join(process.resourcesPath, 'database', 'schema.sql')
  );

  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  try { db.prepare('ALTER TABLE messages ADD COLUMN thinking TEXT').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN tool_steps TEXT').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN cost REAL').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN duration INTEGER').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN input_tokens INTEGER').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN output_tokens INTEGER').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN cache_creation_tokens INTEGER').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN cache_read_tokens INTEGER').run(); } catch {}
  try { db.prepare("CREATE TABLE IF NOT EXISTS user_skills (id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1, updated_at TEXT DEFAULT (datetime('now')))").run(); } catch {}
  try { db.prepare("ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT '[]'").run(); } catch {}
  try { db.prepare('ALTER TABLE logs ADD COLUMN content TEXT').run(); } catch {}
  try { db.prepare("ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0").run(); } catch {}

  return db;
}

// 关闭数据库连接并释放资源
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
