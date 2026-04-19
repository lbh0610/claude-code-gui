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
  try { db.prepare('ALTER TABLE sessions ADD COLUMN parent_id TEXT').run(); } catch {}
  try { db.prepare('ALTER TABLE sessions ADD COLUMN budget_limit REAL').run(); } catch {}
  try { db.prepare(`CREATE TABLE IF NOT EXISTS knowledge_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`).run(); } catch {}
  try { db.prepare(`CREATE TABLE IF NOT EXISTS knowledge_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL REFERENCES knowledge_docs(id),
    term TEXT NOT NULL,
    frequency INTEGER DEFAULT 1
  )`).run(); } catch {}
  try { db.prepare(`CREATE TABLE IF NOT EXISTS prompt_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    prompt TEXT NOT NULL,
    icon TEXT DEFAULT '📋',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`).run(); } catch {}
  try { db.prepare(`CREATE TABLE IF NOT EXISTS tool_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    tool_name TEXT NOT NULL,
    call_count INTEGER DEFAULT 1,
    success_count INTEGER DEFAULT 0,
    last_called TEXT DEFAULT (datetime('now'))
  )`).run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_knowledge_term ON knowledge_index(term)').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_docs(category)').run(); } catch {}
  try { db.prepare('CREATE INDEX IF NOT EXISTS idx_tool_session ON tool_usage(session_id)').run(); } catch {}

  // 初始化内置 Prompt 模板
  try {
    const templates = [
      { id: 'code-review', name: '代码审查', description: '系统性审查代码质量、潜在 bug 和安全隐患', category: '开发', prompt: '请审查以下代码，检查潜在 bug、安全隐患、性能问题和可维护性：\n\n```{{code}}\n```\n\n请指出问题并给出具体改进建议。', icon: '🔍' },
      { id: 'bug-fix', name: 'Bug 修复', description: '分析错误信息，定位并修复 bug', category: '开发', prompt: '以下代码出现了一个 bug，请分析原因并修复：\n\n错误信息：{{error}}\n\n相关代码：\n```{{code}}\n```', icon: '🐛' },
      { id: 'refactor', name: '重构优化', description: '简化逻辑、消除重复、优化架构', category: '开发', prompt: '请重构以下代码，消除重复、简化逻辑、优化架构：\n\n```{{code}}\n```\n\n要求：保持功能不变，提高可读性和可维护性。', icon: '♻️' },
      { id: 'test-gen', name: '生成测试', description: '为代码生成单元测试', category: '开发', prompt: '请为以下代码生成单元测试，覆盖正常路径、边界情况和异常处理：\n\n```{{code}}\n```\n\n使用项目的测试框架。', icon: '🧪' },
      { id: 'explain-code', name: '解释代码', description: '分析代码功能、执行流程和关键逻辑', category: '开发', prompt: '请解释以下代码的功能、执行流程和关键逻辑：\n\n```{{code}}\n```', icon: '💡' },
      { id: 'write-doc', name: '编写文档', description: '为代码生成清晰的文档注释', category: '开发', prompt: '请为以下代码编写文档注释（JSDoc/TSDoc 格式）：\n\n```{{code}}\n```', icon: '📝' },
      { id: 'api-design', name: 'API 设计', description: '设计 RESTful API 接口', category: '后端', prompt: '请为以下需求设计 RESTful API 接口：\n\n需求：{{requirements}}\n\n请提供：\n1. 接口路径和方法\n2. 请求参数\n3. 响应格式\n4. 错误码', icon: '🔌' },
      { id: 'perf-optimize', name: '性能优化', description: '分析性能瓶颈并优化', category: '开发', prompt: '以下代码存在性能问题，请分析瓶颈并优化：\n\n```{{code}}\n```\n\n请指出性能问题并给出优化方案。', icon: '⚡' },
    ];
    for (const t of templates) {
      db.prepare('INSERT OR IGNORE INTO prompt_templates (id, name, description, category, prompt, icon) VALUES (?, ?, ?, ?, ?, ?)').run(t.id, t.name, t.description, t.category, t.prompt, t.icon);
    }
  } catch {}

  return db;
}

// 关闭数据库连接并释放资源
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
