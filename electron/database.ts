import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH } from './config';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // 确保数据库目录存在
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 执行 schema.sql 建表
  const schemaPath = path.join(
    process.env.NODE_ENV === 'development'
      ? path.join(__dirname, '..', '..', 'database', 'schema.sql')
      : path.join(process.resourcesPath, 'database', 'schema.sql')
  );

  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  // 迁移：为已存在的旧表添加缺失的列
  try { db.prepare('ALTER TABLE messages ADD COLUMN thinking TEXT').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN tool_steps TEXT').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN cost REAL').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN duration INTEGER').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN input_tokens INTEGER').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN output_tokens INTEGER').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN cache_creation_tokens INTEGER').run(); } catch {}
  try { db.prepare('ALTER TABLE messages ADD COLUMN cache_read_tokens INTEGER').run(); } catch {}
  try { db.prepare("CREATE TABLE IF NOT EXISTS user_skills (id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 1, updated_at TEXT DEFAULT (datetime('now')))").run(); } catch {}

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
