// 引入文件系统模块，用于读取文件状态和目录扫描
import fs from 'node:fs';
// 引入路径模块，用于路径拼接
import path from 'node:path';
// 引入操作系统相关模块
import os from 'node:os';
// 引入数据库连接获取函数
import { getDb } from '../database';
// 引入数据库路径、配置路径、插件目录、CLI 路径常量
import { DB_PATH, CONFIG_PATH, PLUGIN_DIR, getCliPath } from '../config';
// 引入配置加载和解密函数
import { loadConfig, decryptValue } from './config-manager';
// 引入 CLI 状态查询函数
import { getStatus } from './cli-manager';

/**
 * 系统环境信息接口
 */
interface DiagSystemInfo {
  platform: string;     // 操作系统类型和版本
  arch: string;         // CPU 架构
  hostname: string;     // 主机名
  nodeVersion: string;  // Node.js 版本
  uptime: string;       // 进程运行时间
  totalMemory: string;  // 总内存
  freeMemory: string;   // 可用内存
  cpuCores: number;     // CPU 核心数
  cpuModel: string;     // CPU 型号
}

/**
 * 配置状态信息接口
 */
interface DiagConfigStatus {
  configured: boolean;  // 是否已配置
  apiKey: string;       // API Key 脱敏显示
  model: string;        // 当前模型
  gatewayUrl: string;   // 网关地址
  proxy: string;        // 代理地址
  systemPrompt: boolean; // 是否配置了系统提示词
  envVars: number;      // 自定义环境变量数量
  fileExists: boolean;  // 配置文件是否存在
}

/**
 * 数据库统计信息接口
 */
interface DiagDbStats {
  dbPath: string;       // 数据库文件路径
  dbSize: string;       // 数据库大小（可读格式）
  sessions: number;     // 会话数量
  messages: number;     // 消息数量
  logs: number;         // 日志数量
  plugins: number;      // 插件数量
  skills: number;       // Skill 数量
}

/**
 * 磁盘用量信息接口
 */
interface DiagDiskUsage {
  appDir: string;       // 应用数据目录路径
  appDirSize: string;   // 应用目录总大小
  dbSizeBytes: number;  // 数据库文件大小（字节）
  configSizeBytes: number; // 配置文件大小（字节）
  logCount: number;     // 日志条数
  pluginDir: string;    // 插件目录路径
  pluginDirExists: boolean; // 插件目录是否存在
}

/**
 * CLI 引擎状态信息接口
 */
interface DiagCliStatus {
  status: string;       // 运行状态
  pid: number | null;   // 进程 PID
  sessionCount: number; // 活跃会话数
  cliPath: string;      // CLI 可执行文件路径
  cliExists: boolean;   // CLI 是否存在
}

/**
 * 诊断报告总接口
 */
interface DiagResult {
  system: DiagSystemInfo;  // 系统环境
  config: DiagConfigStatus; // 配置状态
  db: DiagDbStats;         // 数据库统计
  disk: DiagDiskUsage;     // 磁盘用量
  cli: DiagCliStatus;      // CLI 状态
  timestamp: string;       // 诊断时间戳
}

/**
 * 将字节数转为可读格式（B/KB/MB/GB）
 * @param bytes - 字节数
 * @returns 可读的大小字符串
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * 递归计算目录总大小
 * @param dirPath - 目录路径
 * @returns 目录总字节数
 */
function getDirSize(dirPath: string): number {
  let total = 0;
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          // 递归计算子目录
          total += getDirSize(fullPath);
        } else {
          // 累加文件大小
          total += fs.statSync(fullPath).size;
        }
      } catch { /* 权限不足或文件被删除则跳过 */ }
    }
  } catch { /* 目录不存在或无权限则跳过 */ }
  return total;
}

/**
 * 收集系统环境信息
 * @returns 系统环境信息对象
 */
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
    // 清理 CPU 型号中的多余空格和 (R) 标记
    cpuModel: cpus[0]?.model?.replace(/\s*\(R\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || 'unknown',
  };
}

/**
 * 收集配置状态信息
 * @returns 配置状态对象
 */
function getConfigStatus(): DiagConfigStatus {
  const config = loadConfig();
  const apiKeyRaw = config.apiKey as string | undefined;
  let apiKeyDisplay = '未配置';
  // 如果有 API Key 则进行脱敏处理
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
      // 明文则直接取末四位
      apiKeyDisplay = '****' + apiKeyRaw.slice(-4);
    }
  }

  // 计算自定义环境变量数量
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

/**
 * 收集数据库统计信息
 * @returns 数据库统计对象
 */
function getDbStats(): DiagDbStats {
  const db = getDb();
  // 各表行数统计
  const sessions = db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number };
  const messages = db.prepare('SELECT COUNT(*) as c FROM messages').get() as { c: number };
  const logs = db.prepare('SELECT COUNT(*) as c FROM logs').get() as { c: number };
  const plugins = db.prepare('SELECT COUNT(*) as c FROM plugins').get() as { c: number };
  const skills = db.prepare("SELECT COUNT(*) as c FROM user_skills").get() as { c: number };

  // 获取数据库文件大小
  let dbSize = '0 B';
  try {
    dbSize = formatBytes(fs.statSync(DB_PATH).size);
  } catch { /* 文件不存在则忽略 */ }

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

/**
 * 收集磁盘用量信息
 * @returns 磁盘用量对象
 */
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

/**
 * 收集 CLI 引擎状态
 * @returns CLI 状态对象
 */
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

/**
 * 汇总所有诊断信息
 * @returns 完整诊断报告
 */
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

/**
 * 注册所有诊断相关的 IPC 处理函数
 * @param ipcMain - Electron 主进程 IPC 实例
 */
export function registerDiagnosticHandlers(ipcMain: Electron.IpcMain): void {
  // 获取诊断报告
  ipcMain.handle('diagnostic:get', () => getDiagnostics());
}
