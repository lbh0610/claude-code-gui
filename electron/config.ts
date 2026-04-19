import path from 'node:path';
import { app } from 'electron';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

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
 * 检测 claude CLI 是否已在系统 PATH 中
 * @returns claude 可执行文件的绝对路径，不存在则返回 null
 */
export function detectCli(): string | null {
  const isWindows = process.platform === 'win32';
  try {
    const cmd = isWindows ? 'where claude' : 'which claude';
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (!result) return null;
    return isWindows ? result.split('\r\n')[0] : result;
  } catch {
    return null;
  }
}

/**
 * 获取 CLI 可执行文件的绝对路径
 * 优先使用系统 PATH 中的 claude，兜底使用随包分发的二进制文件
 * @param cliPathOverride - 用户自定义的 CLI 路径
 * @returns CLI 可执行文件的完整路径
 */
export function getCliPath(cliPathOverride?: string): string {
  if (cliPathOverride) return cliPathOverride;

  const detected = detectCli();
  if (detected) return detected;

  // 兜底：随包分发的二进制文件
  const baseDir = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const isWindows = process.platform === 'win32';
  return path.join(baseDir, 'native-bin', isWindows ? 'claude.cmd' : 'claude');
}

/**
 * 异步安装 claude CLI（通过 npm 全局安装）
 * @param onProgress - 进度回调函数
 * @returns 安装结果：成功返回 claude 路径，失败返回错误信息
 */
export async function installCli(
  onProgress?: (msg: string) => void
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const isWindows = process.platform === 'win32';

  onProgress?.('正在安装 Claude CLI，请稍候...');

  try {
    execSync(
      isWindows
        ? 'npm install -g @anthropic-ai/claude-code'
        : 'npm install -g @anthropic-ai/claude-code',
      {
        stdio: 'pipe',
        timeout: 300000, // 5 分钟超时
        env: { ...process.env, CI: '1' },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `安装失败: ${msg}` };
  }

  // 安装完成后检测路径
  onProgress?.('安装完成，正在验证...');
  const cliPath = detectCli();
  if (cliPath) {
    onProgress?.(`验证成功: ${cliPath}`);
    return { ok: true, path: cliPath };
  }
  return { ok: false, error: '安装完成但未找到 claude，请检查 npm 全局路径' };
}

/**
 * 读取 Claude CLI 自带的配置（~/.claude/settings.json）
 * @returns 提取到的配置对象
 */
export function readClaudeCliConfig(): {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  hasConfig: boolean;
} {
  const settingsPath = path.join(app.getPath('home'), '.claude', 'settings.json');
  try {
    if (!fs.existsSync(settingsPath)) return { hasConfig: false };

    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);
    const env = settings.env as Record<string, unknown> | undefined;

    return {
      apiKey: env?.ANTHROPIC_API_KEY as string | undefined,
      baseUrl: env?.ANTHROPIC_BASE_URL as string | undefined,
      model: env?.ANTHROPIC_MODEL as string | undefined,
      hasConfig: !!(env?.ANTHROPIC_API_KEY || env?.ANTHROPIC_BASE_URL),
    };
  } catch {
    return { hasConfig: false };
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
