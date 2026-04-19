import path from 'node:path';
import { app } from 'electron';
import fs from 'node:fs';

/** 应用数据根目录，指向 Electron 的用户数据目录 */
export const APP_DATA_DIR = app.getPath('userData');

/** 数据库文件的完整路径，位于应用数据目录下 */
export const DB_PATH = path.join(APP_DATA_DIR, 'app.db');

/** 日志文件存储目录 */
export const LOG_DIR = path.join(APP_DATA_DIR, 'logs');

/** 插件安装与加载目录 */
export const PLUGIN_DIR = path.join(APP_DATA_DIR, 'plugins');

/** Skills 目录，指向用户家目录下的 .claude/skills */
export const SKILLS_PATH = path.join(app.getPath('home'), '.claude', 'skills');

/** 应用配置文件（JSON 格式）的完整路径 */
export const CONFIG_PATH = path.join(APP_DATA_DIR, 'config.json');

/** 应用版本号，取自 package.json，回退值为 '0.1.0' */
export const APP_VERSION = app.getVersion() || '0.1.0';

/** 应用名称，取自 package.json，回退值为 'Agent Workbench' */
export const APP_NAME = app.getName() || 'Agent Workbench';

/**
 * 获取 CLI 可执行文件的绝对路径
 * @param cliPathOverride - 用户自定义的 CLI 路径，若提供则直接返回
 * @returns CLI 可执行文件的完整路径；优先使用系统 PATH 中的 claude，兜底使用随包分发的二进制文件
 */
export function getCliPath(cliPathOverride?: string): string {
  if (cliPathOverride) return cliPathOverride;

  const { execSync } = require('child_process');
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    return path.join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      'native-bin',
      'claude'
    );
  }
}

/**
 * 确保所有必要的子目录已存在，若不存在则递归创建
 * 涵盖日志目录、插件目录和应用数据根目录
 */
export function ensureDirs(): void {
  for (const dir of [LOG_DIR, PLUGIN_DIR, APP_DATA_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
