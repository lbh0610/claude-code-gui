import fs from 'node:fs';
import crypto from 'node:crypto';
import { CONFIG_PATH } from '../config';

const DEFAULT_CONFIG: Record<string, unknown> = {
  cliPath: '',
  apiKey: '',
  gatewayUrl: '',
  model: 'claude-sonnet-4-6-20250514',
  proxy: '',
  autoCheckUpdate: true,
  theme: 'dark',
  envVariables: {},
  pluginWhitelist: [],
  enterpriseMode: false,
};

/**
 * 配置管理器：JSON 文件读写，API Key 加密存储
 */

function loadConfig(): Record<string, unknown> {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config: Record<string, unknown>): void {
  // API Key 加密存储（跳过已加密的值）
  if (config.apiKey && typeof config.apiKey === 'string' && config.apiKey.length > 0) {
    const key = config.apiKey as string;
    if (!key.startsWith('enc:')) {
      config.apiKey = encryptValue(key);
    }
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function encryptValue(value: string): string {
  // 简单加密：实际生产应使用系统 keychain
  const key = crypto.scryptSync('agent-workbench-key', 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

function decryptValue(encrypted: string): string {
  if (!encrypted.startsWith('enc:')) return encrypted;
  const parts = encrypted.split(':');
  if (parts.length !== 4) return encrypted;
  const key = crypto.scryptSync('agent-workbench-key', 'salt', 32);
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const encryptedData = parts[3];
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function getConfigForRenderer(): Record<string, unknown> {
  const config = loadConfig();
  // 返回时保留 apiKey 但做脱敏
  if (config.apiKey && typeof config.apiKey === 'string') {
    const raw = decryptValue(config.apiKey as string);
    (config as Record<string, unknown>).apiKeyDisplay = raw ? '****' + raw.slice(-4) : '';
  }
  return config;
}

async function testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; msg: string }> {
  const apiKey = config.apiKey ? decryptValue(config.apiKey as string) : (config.apiKey as string);
  const gatewayUrl = (config.gatewayUrl as string) || 'https://api.anthropic.com';

  if (!apiKey && !gatewayUrl) {
    return { ok: false, msg: '请配置 API Key 或企业网关地址' };
  }

  try {
    // 简单连通性测试
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${gatewayUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model || 'claude-sonnet-4-6-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok || resp.status === 400) {
      // 400 表示 key 有效但请求参数不完整（正常）
      return { ok: true, msg: '连接成功' };
    }
    const text = await resp.text();
    return { ok: false, msg: `连接失败: ${resp.status} ${text.slice(0, 200)}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, msg: `连接超时或失败: ${msg}` };
  }
}

export function getConfigExport(): Record<string, unknown> {
  const config = loadConfig();
  // 导出时保留加密的 API Key
  return config;
}

export function importConfig(filePath: string): { ok: boolean; msg: string } {
  try {
    if (!fs.existsSync(filePath)) return { ok: false, msg: '文件不存在' };
    const raw = fs.readFileSync(filePath, 'utf-8');
    const imported = JSON.parse(raw);
    if (typeof imported !== 'object' || Array.isArray(imported)) return { ok: false, msg: '配置文件格式无效' };
    saveConfig({ ...loadConfig(), ...imported });
    return { ok: true, msg: `已导入 ${Object.keys(imported).length} 项配置` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, msg: `导入失败: ${msg}` };
  }
}

export function registerConfigHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('config:get', () => getConfigForRenderer());
  ipcMain.handle('config:save', (_, config: Record<string, unknown>) => saveConfig(config));
  ipcMain.handle('config:testConnection', (_, config: Record<string, unknown>) => testConnection(config));
  ipcMain.handle('config:export', () => getConfigExport());
  ipcMain.handle('config:import', (_, filePath: string) => importConfig(filePath));
}
