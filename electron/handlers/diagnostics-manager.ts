import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DB_PATH, CONFIG_PATH, PLUGIN_DIR, getCliPath } from '../config';
import { getDb } from '../database';
import { loadConfig, decryptValue } from './config-manager';
import { getStatus } from './cli-manager';

/**
 * 系统诊断中心：收集系统信息、配置状态、数据库统计、磁盘用量等
 */

interface DiagSystemInfo {
  platform: string;
  arch: string;
  hostname: string;
  nodeVersion: string;
  uptime: string;
  totalMemory: string;
  freeMemory: string;
  cpuCores: number;
  cpuModel: string;
}

interface DiagConfigStatus {
  configured: boolean;
  apiKey: string;          // masked or empty
  model: string;
  gatewayUrl: string;
  proxy: string;
  systemPrompt: boolean;
  envVars: number;
  fileExists: boolean;
}

interface DiagDbStats {
  dbPath: string;
  dbSize: string;
  sessions: number;
  messages: number;
  logs: number;
  plugins: number;
  skills: number;
}

interface DiagDiskUsage {
  appDir: string;
  appDirSize: string;
  dbSizeBytes: number;
  configSizeBytes: number;
  logCount: number;
  pluginDir: string;
  pluginDirExists: boolean;
}

interface DiagCliStatus {
  status: string;
  pid: number | null;
  sessionCount: number;
  cliPath: string;
  cliExists: boolean;
}

interface DiagResult {
  system: DiagSystemInfo;
  config: DiagConfigStatus;
  db: DiagDbStats;
  disk: DiagDiskUsage;
  cli: DiagCliStatus;
  timestamp: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getDirSize(dirPath: string): number {
  let total = 0;
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          total += getDirSize(fullPath);
        } else {
          total += fs.statSync(fullPath).size;
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return total;
}

function getSystemInfo(): DiagSystemInfo {
  const memInfo = os.totalmem();
  const freeInfo = os.freemem();
  const cpus = os.cpus();
  return {
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    hostname: os.hostname(),
    nodeVersion: process.versions.node,
    uptime: `${Math.round(process.uptime() / 60)} 分钟`,
    totalMemory: formatBytes(memInfo),
    freeMemory: formatBytes(freeInfo),
    cpuCores: cpus.length,
    cpuModel: cpus[0]?.model?.replace(/\s*\(R\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || 'unknown',
  };
}

function getConfigStatus(): DiagConfigStatus {
  const config = loadConfig();
  const apiKeyRaw = config.apiKey as string | undefined;
  let apiKeyDisplay = '未配置';
  if (apiKeyRaw && apiKeyRaw.length > 0) {
    if (apiKeyRaw.startsWith('enc:')) {
      // 已加密，尝试解密后脱敏
      try {
        const decrypted = decryptValue(apiKeyRaw);
        if (decrypted && decrypted.length > 4) {
          apiKeyDisplay = '****' + decrypted.slice(-4);
        } else {
          apiKeyDisplay = '已配置 (加密)';
        }
      } catch {
        apiKeyDisplay = '已配置 (加密)';
      }
    } else {
      apiKeyDisplay = '****' + apiKeyRaw.slice(-4);
    }
  }

  const envVars = config.envVariables && typeof config.envVariables === 'object' && !Array.isArray(config.envVariables)
    ? Object.keys(config.envVariables as Record<string, unknown>).length
    : 0;

  return {
    configured: !!(apiKeyRaw || config.gatewayUrl),
    apiKey: apiKeyDisplay,
    model: (config.model as string) || '未设置',
    gatewayUrl: (config.gatewayUrl as string) || '默认 (api.anthropic.com)',
    proxy: (config.proxy as string) || '未配置',
    systemPrompt: !!(config.systemPrompt && typeof config.systemPrompt === 'string' && config.systemPrompt.length > 0),
    envVars,
    fileExists: fs.existsSync(CONFIG_PATH),
  };
}

function getDbStats(): DiagDbStats {
  const db = getDb();
  const sessions = db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number };
  const messages = db.prepare('SELECT COUNT(*) as c FROM messages').get() as { c: number };
  const logs = db.prepare('SELECT COUNT(*) as c FROM logs').get() as { c: number };
  const plugins = db.prepare('SELECT COUNT(*) as c FROM plugins').get() as { c: number };
  const skills = db.prepare("SELECT COUNT(*) as c FROM user_skills").get() as { c: number };

  let dbSize = '0 B';
  try {
    dbSize = formatBytes(fs.statSync(DB_PATH).size);
  } catch { /* ignore */ }

  return {
    dbPath: DB_PATH,
    dbSize,
    sessions: sessions.c,
    messages: messages.c,
    logs: logs.c,
    plugins: plugins.c,
    skills: skills.c,
  };
}

function getDiskUsage(): DiagDiskUsage {
  const appDir = path.dirname(DB_PATH);
  const dbSizeBytes = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  const configSizeBytes = fs.existsSync(CONFIG_PATH) ? fs.statSync(CONFIG_PATH).size : 0;

  return {
    appDir,
    appDirSize: formatBytes(getDirSize(appDir)),
    dbSizeBytes,
    configSizeBytes,
    logCount: (getDb().prepare('SELECT COUNT(*) as c FROM logs').get() as { c: number } | undefined)?.c ?? 0,
    pluginDir: PLUGIN_DIR,
    pluginDirExists: fs.existsSync(PLUGIN_DIR),
  };
}

function getCliStatus(): DiagCliStatus {
  const status = getStatus();
  const cliPath = getCliPath('');
  return {
    status: status.status,
    pid: status.pid,
    sessionCount: status.sessionCount,
    cliPath,
    cliExists: fs.existsSync(cliPath),
  };
}

export function getDiagnostics(): DiagResult {
  return {
    system: getSystemInfo(),
    config: getConfigStatus(),
    db: getDbStats(),
    disk: getDiskUsage(),
    cli: getCliStatus(),
    timestamp: new Date().toISOString(),
  };
}

export function registerDiagnosticHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('diagnostic:get', () => getDiagnostics());
}
