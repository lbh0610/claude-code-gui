// 工具使用统计管理
import { getDb } from '../database';
import { addLog } from './log-manager';

interface ToolStat {
  id: number;
  session_id: string | null;
  tool_name: string;
  call_count: number;
  success_count: number;
  last_called: string;
}

interface ToolSessionStat {
  tool_name: string;
  totalCalls: number;
  totalSuccess: number;
  sessions: number;
  lastCalled: string;
}

/**
 * 记录工具调用
 */
export function recordToolCall(sessionId: string, toolName: string, success: boolean): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO tool_usage (session_id, tool_name, call_count, success_count, last_called)
     VALUES (?, ?, 1, ?, datetime('now'))
     ON CONFLICT DO NOTHING`
  ).run(sessionId, toolName, success ? 1 : 0);

  // 更新统计
  db.prepare(
    `UPDATE tool_usage SET call_count = call_count + 1, success_count = success_count + ?, last_called = datetime('now')
     WHERE session_id = ? AND tool_name = ?`
  ).run(success ? 1 : 0, sessionId, toolName);
}

/**
 * 获取所有工具使用统计
 */
export function getAllToolStats(): ToolSessionStat[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT tool_name, SUM(call_count) as totalCalls, SUM(success_count) as totalSuccess, COUNT(DISTINCT session_id) as sessions, MAX(last_called) as lastCalled ' +
    'FROM tool_usage GROUP BY tool_name ORDER BY totalCalls DESC'
  ).all() as ToolSessionStat[];
  return rows;
}

/**
 * 获取指定会话的工具使用统计
 */
export function getSessionToolStats(sessionId: string): ToolStat[] {
  return getDb().prepare(
    'SELECT * FROM tool_usage WHERE session_id = ? ORDER BY call_count DESC'
  ).all(sessionId) as ToolStat[];
}

/**
 * 重置工具使用统计
 */
export function resetToolStats(): void {
  getDb().prepare('DELETE FROM tool_usage').run();
  addLog('tool', 'info', 'stats_reset', '工具使用统计已重置');
}

export function registerToolHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('tool:list', () => getAllToolStats());
  ipcMain.handle('tool:session', (_, sessionId: string) => getSessionToolStats(sessionId));
  ipcMain.handle('tool:record', (_, { sessionId, toolName, success }: { sessionId: string; toolName: string; success: boolean }) => recordToolCall(sessionId, toolName, success));
  ipcMain.handle('tool:reset', () => resetToolStats());
}
