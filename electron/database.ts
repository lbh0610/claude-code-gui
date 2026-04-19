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

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
