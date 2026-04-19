CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_dir TEXT NOT NULL,
    name TEXT,
    tags TEXT DEFAULT '[]',
    status TEXT DEFAULT 'idle',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    cli_pid INTEGER,
    summary TEXT,
    pinned INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS configs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    encrypted INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    thinking TEXT,
    tool_steps TEXT,
    cost REAL,
    duration INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_creation_tokens INTEGER,
    cache_read_tokens INTEGER,
    timestamp INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);

CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    component TEXT,
    level TEXT DEFAULT 'info',
    event TEXT,
    summary TEXT,
    session_id TEXT REFERENCES sessions(id),
    content TEXT
);

CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT,
    enabled INTEGER DEFAULT 1,
    source TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS update_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_version TEXT,
    to_version TEXT,
    status TEXT,
    applied_at TEXT DEFAULT (datetime('now')),
    method TEXT
);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_dir);

CREATE TABLE IF NOT EXISTS user_skills (
    id TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 知识库文档
CREATE TABLE IF NOT EXISTS knowledge_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 知识库文档索引（简易 TF-IDF 分词）
CREATE TABLE IF NOT EXISTS knowledge_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL REFERENCES knowledge_docs(id),
    term TEXT NOT NULL,
    frequency INTEGER DEFAULT 1
);

-- Prompt 模板
CREATE TABLE IF NOT EXISTS prompt_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    prompt TEXT NOT NULL,
    icon TEXT DEFAULT '📋',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 工具使用统计
CREATE TABLE IF NOT EXISTS tool_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    tool_name TEXT NOT NULL,
    call_count INTEGER DEFAULT 1,
    success_count INTEGER DEFAULT 0,
    last_called TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_term ON knowledge_index(term);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_docs(category);
CREATE INDEX IF NOT EXISTS idx_tool_session ON tool_usage(session_id);

-- 内置 Prompt 模板
INSERT OR IGNORE INTO prompt_templates (id, name, description, category, prompt, icon) VALUES
    ('code-review', '代码审查', '系统性审查代码质量、潜在 bug 和安全隐患', '开发', '请审查以下代码，检查潜在 bug、安全隐患、性能问题和可维护性：\n\n```{{code}}\n```\n\n请指出问题并给出具体改进建议。', '🔍'),
    ('bug-fix', 'Bug 修复', '分析错误信息，定位并修复 bug', '开发', '以下代码出现了一个 bug，请分析原因并修复：\n\n错误信息：{{error}}\n\n相关代码：\n```{{code}}\n```', '🐛'),
    ('refactor', '重构优化', '简化逻辑、消除重复、优化架构', '开发', '请重构以下代码，消除重复、简化逻辑、优化架构：\n\n```{{code}}\n```\n\n要求：保持功能不变，提高可读性和可维护性。', '♻️'),
    ('test-gen', '生成测试', '为代码生成单元测试', '开发', '请为以下代码生成单元测试，覆盖正常路径、边界情况和异常处理：\n\n```{{code}}\n```\n\n使用项目的测试框架。', '🧪'),
    ('explain-code', '解释代码', '分析代码功能、执行流程和关键逻辑', '开发', '请解释以下代码的功能、执行流程和关键逻辑：\n\n```{{code}}\n```', '💡'),
    ('write-doc', '编写文档', '为代码生成清晰的文档注释', '开发', '请为以下代码编写文档注释（JSDoc/TSDoc 格式）：\n\n```{{code}}\n```', '📝'),
    ('api-design', 'API 设计', '设计 RESTful API 接口', '后端', '请为以下需求设计 RESTful API 接口：\n\n需求：{{requirements}}\n\n请提供：\n1. 接口路径和方法\n2. 请求参数\n3. 响应格式\n4. 错误码', '🔌'),
    ('perf-optimize', '性能优化', '分析性能瓶颈并优化', '开发', '以下代码存在性能问题，请分析瓶颈并优化：\n\n```{{code}}\n```\n\n请指出性能问题并给出优化方案。', '⚡');
