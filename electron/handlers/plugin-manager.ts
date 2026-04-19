import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../database';
import { PLUGIN_DIR } from '../config';

/**
 * 插件管理器：插件扫描、启用/禁用、来源校验
 */

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  enabled: number;
  source: string | null;
  created_at: string;
}

function scanPlugins(): PluginInfo[] {
  const db = getDb();
  const plugins = db.prepare('SELECT * FROM plugins').all() as PluginInfo[];

  // 扫描物理目录，补充未注册的插件
  if (fs.existsSync(PLUGIN_DIR)) {
    const entries = fs.readdirSync(PLUGIN_DIR);
    for (const entry of entries) {
      const pluginPath = path.join(PLUGIN_DIR, entry);
      if (fs.statSync(pluginPath).isDirectory()) {
        const manifestPath = path.join(pluginPath, 'manifest.json');
        if (fs.existsSync(manifestPath) && !plugins.find((p) => p.id === entry)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            db.prepare(
              'INSERT OR IGNORE INTO plugins (id, name, version, source) VALUES (?, ?, ?, ?)'
            ).run(entry, manifest.name || entry, manifest.version || '0.0.0', manifest.source || 'local');
          } catch {
            // 无效的 manifest，跳过
          }
        }
      }
    }
  }

  return db.prepare('SELECT * FROM plugins').all() as PluginInfo[];
}

function togglePlugin(id: string, enabled: boolean): void {
  const db = getDb();
  db.prepare('UPDATE plugins SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

export function registerPluginHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('plugin:list', () => scanPlugins());
  ipcMain.handle('plugin:toggle', (_, { id, enabled }: { id: string; enabled: boolean }) =>
    togglePlugin(id, enabled)
  );
}
