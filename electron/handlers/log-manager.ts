// 引入数据库连接获取函数
import { getDb } from '../database';
// 引入文件系统模块，用于日志导出
import fs from 'node:fs';
// 引入路径模块，用于路径拼接
import path from 'node:path';
// 引入日志目录和应用版本常量
import { LOG_DIR, APP_VERSION } from '../config';

/**
 * 日志数据行接口
 */
interface LogEntry {
  id: number;           // 日志自增 ID
  timestamp: string;    // 时间戳字符串
  component: string | null;  // 来源组件名
  level: string;        // 日志级别（info/warn/error）
  event: string | null; // 事件名
  summary: string | null;  // 摘要描述
  session_id: string | null; // 关联会话 ID
}

/**
 * 查询日志列表，支持多维度过滤和搜索
 * @param filter - 可选过滤条件
 * @returns 日志列表
 */
export function listLogs(
  filter?: { level?: string; component?: string; sessionId?: string; search?: string; limit?: number }
): LogEntry[] {
  const db = getDb();
  // 基础 SQL，WHERE 1=1 便于后续拼接 AND 条件
  let sql = 'SELECT * FROM logs WHERE 1=1';
  const params: unknown[] = [];

  // 按日志级别过滤
  if (filter?.level) {
    sql += ' AND level = ?';
    params.push(filter.level);
  }
  // 按组件过滤
  if (filter?.component) {
    sql += ' AND component = ?';
    params.push(filter.component);
  }
  // 按会话 ID 过滤
  if (filter?.sessionId) {
    sql += ' AND session_id = ?';
    params.push(filter.sessionId);
  }
  // 全文搜索：匹配事件名、摘要或组件名
  if (filter?.search) {
    sql += ' AND (event LIKE ? OR summary LIKE ? OR component LIKE ?)';
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }

  // 按时间倒序
  sql += ' ORDER BY timestamp DESC';
  // 限制返回数量
  if (filter?.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  return db.prepare(sql).all(...params) as LogEntry[];
}

/**
 * 写入一条日志到数据库
 * @param component - 来源组件名
 * @param level - 日志级别
 * @param event - 事件名
 * @param summary - 摘要描述
 * @param sessionId - 可选，关联会话 ID
 */
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

/**
 * 导出日志到文件
 * @param filePath - 目标文件路径
 * @param format - 导出格式（json 或 text）
 */
export function exportLogs(filePath: string, format: string): void {
  // 最多导出 1000 条日志
  const logs = listLogs({ limit: 1000 });
  if (format === 'json') {
    // JSON 格式：美化输出
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf-8');
  } else {
    // 文本格式：每行一条日志
    const lines = logs.map(
      (l) => `[${l.timestamp}] [${l.level}] [${l.component}] ${l.event}: ${l.summary || ''}`
    );
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }
}

/**
 * 生成系统诊断报告并写入文件
 * @param filePath - 目标文件路径
 */
export function generateDiagnostic(filePath: string): void {
  // 动态引入 os 模块获取系统信息
  const os = require('node:os');
  // 获取最近 100 条日志
  const logs = listLogs({ limit: 100 });
  // 组装诊断数据
  const diag = {
    version: APP_VERSION,                       // 应用版本
    platform: process.platform,                 // 操作系统平台
    arch: process.arch,                         // CPU 架构
    nodeVersion: process.version,               // Node.js 版本
    memoryUsage: process.memoryUsage(),         // 内存使用情况
    uptime: process.uptime(),                   // 进程运行时间
    logDir: LOG_DIR,                            // 日志目录路径
    recentLogs: logs.slice(0, 20),              // 最近 20 条日志
  };
  fs.writeFileSync(filePath, JSON.stringify(diag, null, 2), 'utf-8');
}

/**
 * 清空全部日志
 */
export function clearLogs(): void {
  getDb().prepare('DELETE FROM logs').run();
}

/**
 * 删除单条日志
 * @param id - 日志 ID
 */
export function deleteLog(id: number): void {
  getDb().prepare('DELETE FROM logs WHERE id = ?').run(id);
}

/**
 * 注册所有日志相关的 IPC 处理函数
 * @param ipcMain - Electron 主进程 IPC 实例
 */
export function registerLogHandlers(ipcMain: Electron.IpcMain): void {
  // 查询日志列表
  ipcMain.handle('log:list', (_, filter) => listLogs(filter));
  // 导出日志
  ipcMain.handle('log:export', (_, { filePath, format }: { filePath: string; format: string }) =>
    exportLogs(filePath, format)
  );
  // 生成诊断报告
  ipcMain.handle('log:diagnostic', (_, { filePath }: { filePath: string }) =>
    generateDiagnostic(filePath)
  );
  // 删除单条日志
  ipcMain.handle('log:delete', (_, id: number) => deleteLog(id));
  // 清空全部日志
  ipcMain.handle('log:clear', () => clearLogs());
}
