// 引入数据库连接获取函数
import { getDb } from '../database';
// 引入日志记录函数
import { addLog } from './log-manager';

/**
 * 会话数据行接口
 */
interface SessionRow {
  id: string;           // 会话唯一标识
  project_dir: string;  // 项目目录路径
  name: string;         // 会话名称
  tags: string;         // 标签数组的 JSON 字符串
  status: string;       // 会话状态（idle/running/error）
  created_at: string;   // 创建时间
  updated_at: string;   // 最后更新时间
  cli_pid: number | null;  // CLI 进程 PID
  summary: string | null;  // 会话摘要
}

/**
 * 消息数据行接口
 */
interface MessageRow {
  id: number;           // 消息自增 ID
  session_id: string;   // 所属会话 ID
  role: string;         // 消息角色（user/assistant/system）
  content: string;      // 消息内容
  thinking: string | null;  // 思考过程
  tool_steps: string | null;  // 工具调用步骤的 JSON
  timestamp: number;    // 消息时间戳
}

/**
 * 列出会话
 * @param projectId - 可选，按项目目录过滤
 * @param tag - 可选，按标签过滤
 * @returns 会话列表
 */
export function listSessions(projectId?: string, tag?: string): SessionRow[] {
  const db = getDb();
  // 按项目目录过滤
  if (projectId) {
    const stmt = db.prepare(
      'SELECT * FROM sessions WHERE project_dir = ? ORDER BY updated_at DESC'
    );
    return stmt.all(projectId) as SessionRow[];
  }
  // 按标签过滤（LIKE 匹配 JSON 数组中的标签）
  if (tag) {
    return db.prepare(
      "SELECT * FROM sessions WHERE tags LIKE ? ORDER BY updated_at DESC LIMIT 50"
    ).all(`%"${tag}"%`) as SessionRow[];
  }
  // 查询所有会话，按更新时间降序，最多 50 条
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 50');
  return stmt.all() as SessionRow[];
}

/**
 * 创建新会话
 * @param data - 包含项目目录和名称的对象
 * @returns 创建的会话数据
 */
export function createSession(data: { projectDir: string; name: string }): SessionRow {
  const db = getDb();
  // 生成唯一 ID：前缀 + 时间戳 + 随机字符串
  const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const stmt = db.prepare(
    'INSERT INTO sessions (id, project_dir, name, status) VALUES (?, ?, ?, ?)'
  );
  // 默认名称为"新会话"，初始状态为 idle
  stmt.run(id, data.projectDir, data.name || '新会话', 'idle');
  // 查询刚插入的会话并返回
  const getStmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  return getStmt.get(id) as SessionRow;
}

/**
 * 保存消息到数据库
 * @param sessionId - 会话 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @param timestamp - 时间戳
 * @param thinking - 可选，思考过程
 * @param toolSteps - 可选，工具调用步骤数组
 * @param cost - 可选，本次消息的费用（美元）
 * @param duration - 可选，本次消息的耗时（毫秒）
 * @param inputTokens - 可选，输入 token 数
 * @param outputTokens - 可选，输出 token 数
 * @param cacheCreationTokens - 可选，缓存创建 token 数
 * @param cacheReadTokens - 可选，缓存读取 token 数
 */
export function saveMessage(
  sessionId: string, role: string, content: string, timestamp: number,
  thinking?: string, toolSteps?: unknown[],
  cost?: number, duration?: number,
  inputTokens?: number, outputTokens?: number,
  cacheCreationTokens?: number, cacheReadTokens?: number,
): void {
  const db = getDb();
  // 插入消息记录，复杂类型转为 JSON 字符串存储
  db.prepare(
    'INSERT INTO messages (session_id, role, content, thinking, tool_steps, cost, duration, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    sessionId, role, content, thinking || null, toolSteps ? JSON.stringify(toolSteps) : null,
    cost ?? null, duration ?? null,
    inputTokens ?? null, outputTokens ?? null,
    cacheCreationTokens ?? null, cacheReadTokens ?? null,
    timestamp,
  );
}

/**
 * 加载会话的所有消息，按时间升序
 * @param sessionId - 会话 ID
 * @returns 消息列表
 */
export function loadMessages(sessionId: string): MessageRow[] {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC'
  );
  return stmt.all(sessionId) as MessageRow[];
}

/**
 * 删除会话及其关联的所有消息和日志
 * @param sessionId - 会话 ID
 */
export function deleteSession(sessionId: string): void {
  const db = getDb();
  // 先删除关联消息
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  // 再删除关联日志
  db.prepare('DELETE FROM logs WHERE session_id = ?').run(sessionId);
  // 最后删除会话本身
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

/**
 * 重命名会话
 * @param sessionId - 会话 ID
 * @param name - 新名称
 */
export function renameSession(sessionId: string, name: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE sessions SET name = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name, sessionId);
}

/**
 * 自动生成会话标题（仅对使用默认名称的会话生效）
 * @param sessionId - 会话 ID
 * @param title - 自动生成的标题
 */
export function autoTitleSession(sessionId: string, title: string): void {
  const db = getDb();
  // 先查询当前名称
  const row = db.prepare('SELECT name FROM sessions WHERE id = ?').get(sessionId) as { name: string } | undefined;
  // 只有默认名称的会话才自动生成标题
  if (row && (row.name === '新会话' || !row.name)) {
    db.prepare(
      "UPDATE sessions SET name = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(title, sessionId);
  }
}

/**
 * 更新会话状态
 * @param sessionId - 会话 ID
 * @param status - 新状态
 */
export function updateSessionStatus(sessionId: string, status: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, sessionId);
}

/**
 * 更新会话标签
 * @param sessionId - 会话 ID
 * @param tags - 标签数组
 */
export function updateSessionTags(sessionId: string, tags: string[]): void {
  const db = getDb();
  // 将标签数组序列化为 JSON 存储
  db.prepare(
    "UPDATE sessions SET tags = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(tags), sessionId);
}

/**
 * 删除会话内的单条消息
 * @param sessionId - 会话 ID
 * @param messageId - 消息 ID
 */
export function deleteMessage(sessionId: string, messageId: number): void {
  const db = getDb();
  // 确保只删除指定会话的消息
  db.prepare('DELETE FROM messages WHERE id = ? AND session_id = ?').run(messageId, sessionId);
  addLog('session', 'info', 'message_deleted', `消息 ${messageId} 已从会话 ${sessionId} 删除`, sessionId);
}

/**
 * 注册所有会话相关的 IPC 处理函数
 * @param ipcMain - Electron 主进程 IPC 实例
 */
export function registerSessionHandlers(ipcMain: Electron.IpcMain): void {
  // 列出会话
  ipcMain.handle('session:list', (_, { projectId, tag }: { projectId?: string; tag?: string }) => listSessions(projectId, tag));
  // 创建会话
  ipcMain.handle('session:create', (_, data: { projectDir: string; name: string }) => {
    const result = createSession(data);
    addLog('session', 'info', 'session_created', `会话 ${result.id} 已创建 (${data.projectDir})`, result.id);
    return result;
  });
  // 删除会话
  ipcMain.handle('session:delete', (_, sessionId: string) => {
    deleteSession(sessionId);
    addLog('session', 'info', 'session_deleted', `会话 ${sessionId} 已删除`, sessionId);
  });
  // 重命名会话
  ipcMain.handle('session:rename', (_, { sessionId, name }: { sessionId: string; name: string }) => renameSession(sessionId, name));
  // 保存消息
  ipcMain.handle('session:messages:save', (_, { sessionId, role, content, timestamp, thinking, toolSteps, cost, duration, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens }: { sessionId: string; role: string; content: string; timestamp: number; thinking?: string; toolSteps?: unknown[]; cost?: number; duration?: number; inputTokens?: number; outputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number }) =>
    saveMessage(sessionId, role, content, timestamp, thinking, toolSteps, cost, duration, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens)
  );
  // 加载消息
  ipcMain.handle('session:messages:load', (_, sessionId: string) => loadMessages(sessionId));
  // 删除消息
  ipcMain.handle('session:messages:delete', (_, { sessionId, messageId }: { sessionId: string; messageId: number }) => deleteMessage(sessionId, messageId));
  // 自动生成标题
  ipcMain.handle('session:autoTitle', (_, { sessionId, title }: { sessionId: string; title: string }) => autoTitleSession(sessionId, title));
  // 更新标签
  ipcMain.handle('session:updateTags', (_, { sessionId, tags }: { sessionId: string; tags: string[] }) => updateSessionTags(sessionId, tags));
}
