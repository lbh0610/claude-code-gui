import { getDb } from '../database';
import fs from 'node:fs';
import path from 'node:path';
import { LOG_DIR, APP_VERSION } from '../config';

/**
 * 日志管理器：日志查询、导出、诊断包生成
 */

interface LogEntry {
  id: number;
  timestamp: string;
  component: string | null;
  level: string;
  event: string | null;
  summary: string | null;
  session_id: string | null;
}

export function listLogs(
  filter?: { level?: string; component?: string; sessionId?: string; limit?: number }
): LogEntry[] {
  const db = getDb();
  let sql = 'SELECT * FROM logs WHERE 1=1';
  const params: unknown[] = [];

  if (filter?.level) {
    sql += ' AND level = ?';
    params.push(filter.level);
  }
  if (filter?.component) {
    sql += ' AND component = ?';
    params.push(filter.component);
  }
  if (filter?.sessionId) {
    sql += ' AND session_id = ?';
    params.push(filter.sessionId);
  }

  sql += ' ORDER BY timestamp DESC';
  if (filter?.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  return db.prepare(sql).all(...params) as LogEntry[];
}

export function addLog(
  component: string,
  level: string,
  event: string,
  summary: string,
  sessionId?: string
): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO logs (component, level, event, summary, session_id) VALUES (?, ?, ?, ?, ?)'
  ).run(component, level, event, summary, sessionId || null);
}

export function exportLogs(filePath: string, format: string): void {
  const logs = listLogs({ limit: 1000 });
  if (format === 'json') {
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf-8');
  } else {
    const lines = logs.map(
      (l) => `[${l.timestamp}] [${l.level}] [${l.component}] ${l.event}: ${l.summary || ''}`
    );
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }
}

export function generateDiagnostic(filePath: string): void {
  const os = require('node:os');
  const logs = listLogs({ limit: 100 });
  const diag = {
    version: APP_VERSION,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    logDir: LOG_DIR,
    recentLogs: logs.slice(0, 20),
  };
  fs.writeFileSync(filePath, JSON.stringify(diag, null, 2), 'utf-8');
}

export function registerLogHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('log:list', (_, filter) => listLogs(filter));
  ipcMain.handle('log:export', (_, { filePath, format }: { filePath: string; format: string }) =>
    exportLogs(filePath, format)
  );
  ipcMain.handle('log:diagnostic', (_, { filePath }: { filePath: string }) =>
    generateDiagnostic(filePath)
  );
}
