import { getDb } from '../database';
import { addLog } from './log-manager';

/**
 * 会话管理器：会话 CRUD，关联项目目录
 */

interface SessionRow {
  id: string;
  project_dir: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  cli_pid: number | null;
  summary: string | null;
}

export function listSessions(projectId?: string): SessionRow[] {
  const db = getDb();
  if (projectId) {
    const stmt = db.prepare(
      'SELECT * FROM sessions WHERE project_dir = ? ORDER BY updated_at DESC'
    );
    return stmt.all(projectId) as SessionRow[];
  }
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 50');
  return stmt.all() as SessionRow[];
}

export function createSession(data: { projectDir: string; name: string }): SessionRow {
  const db = getDb();
  const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const stmt = db.prepare(
    'INSERT INTO sessions (id, project_dir, name, status) VALUES (?, ?, ?, ?)'
  );
  stmt.run(id, data.projectDir, data.name || '新会话', 'idle');
  const getStmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  return getStmt.get(id) as SessionRow;
}

interface MessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  thinking: string | null;
  tool_steps: string | null;
  timestamp: number;
}

export function saveMessage(
  sessionId: string, role: string, content: string, timestamp: number,
  thinking?: string, toolSteps?: unknown[],
  cost?: number, duration?: number,
  inputTokens?: number, outputTokens?: number,
  cacheCreationTokens?: number, cacheReadTokens?: number,
): void {
  const db = getDb();
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

export function loadMessages(sessionId: string): MessageRow[] {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC'
  );
  return stmt.all(sessionId) as MessageRow[];
}

export function deleteSession(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM logs WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function renameSession(sessionId: string, name: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE sessions SET name = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name, sessionId);
}

export function autoTitleSession(sessionId: string, title: string): void {
  const db = getDb();
  const row = db.prepare('SELECT name FROM sessions WHERE id = ?').get(sessionId) as { name: string } | undefined;
  // 只有默认名称的会话才自动生成标题
  if (row && (row.name === '新会话' || !row.name)) {
    db.prepare(
      "UPDATE sessions SET name = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(title, sessionId);
  }
}

export function updateSessionStatus(sessionId: string, status: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, sessionId);
}

export function registerSessionHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('session:list', (_, { projectId }: { projectId?: string }) => listSessions(projectId));
  ipcMain.handle('session:create', (_, data: { projectDir: string; name: string }) => {
    const result = createSession(data);
    addLog('session', 'info', 'session_created', `会话 ${result.id} 已创建 (${data.projectDir})`, result.id);
    return result;
  });
  ipcMain.handle('session:delete', (_, sessionId: string) => {
    deleteSession(sessionId);
    addLog('session', 'info', 'session_deleted', `会话 ${sessionId} 已删除`, sessionId);
  });
  ipcMain.handle('session:rename', (_, { sessionId, name }: { sessionId: string; name: string }) => renameSession(sessionId, name));
  ipcMain.handle('session:messages:save', (_, { sessionId, role, content, timestamp, thinking, toolSteps, cost, duration, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens }: { sessionId: string; role: string; content: string; timestamp: number; thinking?: string; toolSteps?: unknown[]; cost?: number; duration?: number; inputTokens?: number; outputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number }) =>
    saveMessage(sessionId, role, content, timestamp, thinking, toolSteps, cost, duration, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens)
  );
  ipcMain.handle('session:messages:load', (_, sessionId: string) => loadMessages(sessionId));
  ipcMain.handle('session:autoTitle', (_, { sessionId, title }: { sessionId: string; title: string }) => autoTitleSession(sessionId, title));
}
