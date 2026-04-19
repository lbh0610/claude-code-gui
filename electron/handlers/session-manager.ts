import { getDb } from '../database';

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

export function saveMessage(sessionId: string, role: string, content: string, timestamp: number, thinking?: string, toolSteps?: unknown[]): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO messages (session_id, role, content, thinking, tool_steps, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(sessionId, role, content, thinking || null, toolSteps ? JSON.stringify(toolSteps) : null, timestamp);
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

export function updateSessionStatus(sessionId: string, status: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, sessionId);
}

export function registerSessionHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('session:list', (_, { projectId }: { projectId?: string }) => listSessions(projectId));
  ipcMain.handle('session:create', (_, data: { projectDir: string; name: string }) => createSession(data));
  ipcMain.handle('session:delete', (_, sessionId: string) => deleteSession(sessionId));
  ipcMain.handle('session:messages:save', (_, { sessionId, role, content, timestamp, thinking, toolSteps }: { sessionId: string; role: string; content: string; timestamp: number; thinking?: string; toolSteps?: unknown[] }) => saveMessage(sessionId, role, content, timestamp, thinking, toolSteps));
  ipcMain.handle('session:messages:load', (_, sessionId: string) => loadMessages(sessionId));
}
