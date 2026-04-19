// 引入文件系统模块，用于扫描插件目录和读取 Manifest
import fs from 'node:fs';
// 引入路径模块，用于路径拼接
import path from 'node:path';
// 引入数据库连接获取函数
import { getDb } from '../database';
// 引入插件目录常量
import { PLUGIN_DIR } from '../config';

/**
 * 插件信息接口
 */
interface PluginInfo {
  id: string;           // 插件唯一标识
  name: string;         // 插件名称
  version: string;      // 插件版本
  enabled: number;      // 是否启用（1/0）
  source: string | null; // 来源（local/url/git）
  created_at: string;   // 创建时间
}

/**
 * 扫描数据库和物理目录，返回所有插件信息
 * @returns 插件列表
 */
function scanPlugins(): PluginInfo[] {
  const db = getDb();
  // 先查询数据库中已注册的插件
  const plugins = db.prepare('SELECT * FROM plugins').all() as PluginInfo[];

  // 扫描物理目录，发现未注册的新插件
  if (fs.existsSync(PLUGIN_DIR)) {
    const entries = fs.readdirSync(PLUGIN_DIR);
    for (const entry of entries) {
      const pluginPath = path.join(PLUGIN_DIR, entry);
      // 只处理子目录
      if (fs.statSync(pluginPath).isDirectory()) {
        const manifestPath = path.join(pluginPath, 'manifest.json');
        // 有 manifest 且数据库中未注册的插件才处理
        if (fs.existsSync(manifestPath) && !plugins.find((p) => p.id === entry)) {
          try {
            // 解析 manifest.json
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            // 插入到数据库（忽略已存在的）
            db.prepare(
              'INSERT OR IGNORE INTO plugins (id, name, version, source) VALUES (?, ?, ?, ?)'
            ).run(entry, manifest.name || entry, manifest.version || '0.0.0', manifest.source || 'local');
          } catch {
            // Manifest 解析失败或格式错误，跳过
          }
        }
      }
    }
  }

  // 返回最新的插件列表
  return db.prepare('SELECT * FROM plugins').all() as PluginInfo[];
}

/**
 * 切换插件的启用/禁用状态
 * @param id - 插件 ID
 * @param enabled - 是否启用
 */
function togglePlugin(id: string, enabled: boolean): void {
  const db = getDb();
  // 1 表示启用，0 表示禁用
  db.prepare('UPDATE plugins SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

/**
 * 注册所有插件相关的 IPC 处理函数
 * @param ipcMain - Electron 主进程 IPC 实例
 */
export function registerPluginHandlers(ipcMain: Electron.IpcMain): void {
  // 列出所有插件（含目录扫描）
  ipcMain.handle('plugin:list', () => scanPlugins());
  // 切换插件状态
  ipcMain.handle('plugin:toggle', (_, { id, enabled }: { id: string; enabled: boolean }) =>
    togglePlugin(id, enabled)
  );
}
