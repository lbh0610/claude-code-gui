import path from 'node:path';
import { app } from 'electron';
import fs from 'node:fs';

/**
 * 应用配置：路径、常量、数据目录
 */

// 应用数据根目录
export const APP_DATA_DIR = app.getPath('userData');

// 数据库文件路径
export const DB_PATH = path.join(APP_DATA_DIR, 'app.db');

// 日志目录
export const LOG_DIR = path.join(APP_DATA_DIR, 'logs');

// 插件目录
export const PLUGIN_DIR = path.join(APP_DATA_DIR, 'plugins');

// 配置文件路径
export const CONFIG_PATH = path.join(APP_DATA_DIR, 'config.json');

// 应用版本
export const APP_VERSION = app.getVersion() || '0.1.0';

// 应用名称
export const APP_NAME = app.getName() || 'Agent Workbench';

// CLI 可执行文件路径（随包分发或用户配置）
export function getCliPath(cliPathOverride?: string): string {
  if (cliPathOverride) return cliPathOverride;
  // 优先使用系统 PATH 中的 claude
  const { execSync } = require('child_process');
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    // 兜底：使用随包分发的 CLI
    return path.join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      'native-bin',
      'claude'
    );
  }
}

// 确保目录存在
export function ensureDirs(): void {
  for (const dir of [LOG_DIR, PLUGIN_DIR, APP_DATA_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
