// 引入文件系统模块，用于检查配置文件是否存在
import fs from 'node:fs';
// 引入加密模块，用于 AES-256-GCM 加解密
import crypto from 'node:crypto';
// 引入配置路径常量，指向 config.json 的完整路径
import { CONFIG_PATH, detectCli, installCli, readClaudeCliConfig } from '../config';
// 引入 Electron BrowserWindow，用于发送安装进度事件
import { BrowserWindow } from 'electron';

// 默认配置对象，所有键值对作为缺失字段的兜底值
const DEFAULT_CONFIG: Record<string, unknown> = {
  cliPath: '',          // 用户自定义 CLI 路径
  apiKey: '',           // API 密钥（加密后存储）
  gatewayUrl: '',       // 企业网关地址
  model: 'claude-sonnet-4-6-20250514',  // 默认模型
  proxy: '',            // HTTP/HTTPS 代理地址
  autoCheckUpdate: true, // 是否自动检查更新
  theme: 'light',        // 主题模式
  envVariables: {},     // 自定义环境变量键值对
  pluginWhitelist: [],  // 插件白名单列表
  enterpriseMode: false, // 是否启用企业模式
};

/**
 * 从磁盘读取配置，合并默认值后返回
 * 文件不存在或解析失败时返回默认配置
 */
export function loadConfig(): Record<string, unknown> {
  // 配置文件不存在时直接返回默认值副本
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    // 读取文件内容并解析 JSON
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    // 用默认值填充缺失字段，保证配置完整性
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // 解析失败时回退到默认配置
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 保存配置更新，采用读-合并-写策略防止部分保存覆盖其他字段
 * @param updates - 需要更新的配置键值对
 */
export function saveConfig(updates: Record<string, unknown>): void {
  // 先读取磁盘上已有配置
  const existing = loadConfig();
  // 合并已有配置和新更新
  const merged = { ...existing, ...updates };

  // API Key 需要加密存储（跳过已加密的值）
  if (merged.apiKey && typeof merged.apiKey === 'string' && merged.apiKey.length > 0) {
    const key = merged.apiKey as string;
    // 只有明文才加密
    if (!key.startsWith('enc:')) {
      merged.apiKey = encryptValue(key);
    }
  }
  // 将合并后的配置写入磁盘
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
}

/**
 * 使用 AES-256-GCM 加密明文值
 * @param value - 需要加密的明文字符串
 * @returns 格式为 enc:iv:tag:encrypted 的密文
 */
function encryptValue(value: string): string {
  // 从固定口令派生 32 字节密钥
  const key = crypto.scryptSync('agent-workbench-key', 'salt', 32);
  // 生成 16 字节随机初始向量
  const iv = crypto.randomBytes(16);
  // 创建 AES-256-GCM 加密器
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  // 加密数据
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // 获取认证标签
  const tag = cipher.getAuthTag();
  // 返回拼接后的密文字符串
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * 解密配置值，如果未加密则直接返回原值
 * @param encrypted - 加密后的字符串或明文
 * @returns 解密后的明文
 */
export function decryptValue(encrypted: string): string {
  // 不是加密字符串则直接返回
  if (!encrypted.startsWith('enc:')) return encrypted;
  // 按冒号分隔为 iv、tag、encryptedData 三部分
  const parts = encrypted.split(':');
  // 格式不正确则返回原值
  if (parts.length !== 4) return encrypted;
  // 派生相同的解密密钥
  const key = crypto.scryptSync('agent-workbench-key', 'salt', 32);
  // 从十六进制解析初始向量
  const iv = Buffer.from(parts[1], 'hex');
  // 从十六进制解析认证标签
  const tag = Buffer.from(parts[2], 'hex');
  // 提取加密数据
  const encryptedData = parts[3];
  // 创建 AES-256-GCM 解密器
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  // 设置认证标签
  decipher.setAuthTag(tag);
  // 解密数据
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * 获取供渲染层使用的配置，API Key 做脱敏显示
 * @returns 配置对象，额外包含 apiKeyDisplay 字段
 */
function getConfigForRenderer(): Record<string, unknown> {
  // 从磁盘加载完整配置
  const config = loadConfig();
  // 如果有 API Key 则进行脱敏处理
  if (config.apiKey && typeof config.apiKey === 'string') {
    // 先解密获取明文
    const raw = decryptValue(config.apiKey as string);
    // 显示为 **** + 末四位
    (config as Record<string, unknown>).apiKeyDisplay = raw ? '****' + raw.slice(-4) : '';
  }
  return config;
}

/**
 * 测试 API 连接是否正常
 * @param config - 包含 API Key、网关地址、模型的配置对象
 * @returns 连接结果，包含成功标志和消息
 */
async function testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; msg: string }> {
  // 解密 API Key，如果未加密则直接使用
  const apiKey = config.apiKey ? decryptValue(config.apiKey as string) : (config.apiKey as string);
  // 获取网关地址，默认为 Anthropic 官方地址
  const gatewayUrl = (config.gatewayUrl as string) || 'https://api.anthropic.com';

  // 既没有 Key 也没有网关则提示配置
  if (!apiKey && !gatewayUrl) {
    return { ok: false, msg: '请配置 API Key 或企业网关地址' };
  }

  try {
    // 构建请求 URL
    let url = gatewayUrl;
    // 如果 base URL 不以 /v1 结尾，追加 /v1/messages（Anthropic 格式）
    if (!gatewayUrl.endsWith('/v1') && !gatewayUrl.endsWith('/v1/')) {
      url = `${gatewayUrl}/v1/messages`;
    } else if (gatewayUrl.endsWith('/v1')) {
      url = `${gatewayUrl}/messages`;
    }

    // 创建 10 秒超时的控制器
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    // 发起 POST 请求测试连接
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 同时发送两种认证头以兼容不同网关
        'x-api-key': apiKey || '',
        'Authorization': `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model || 'claude-sonnet-4-6-20250514',
        max_tokens: 1,  // 最小请求体
        messages: [{ role: 'user', content: 'test' }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // 200 或 400（参数错误但连接成功）都视为连接正常
    if (resp.ok || resp.status === 400) {
      return { ok: true, msg: '连接成功' };
    }
    // 读取错误响应体
    const text = await resp.text();
    return { ok: false, msg: `连接失败: ${resp.status} ${text.slice(0, 200)}` };
  } catch (e: unknown) {
    // 网络异常或超时
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, msg: `连接超时或失败: ${msg}` };
  }
}

/**
 * 导出配置供外部使用，保留加密的 API Key
 * @returns 完整配置对象
 */
export function getConfigExport(): Record<string, unknown> {
  const config = loadConfig();
  return config;
}

/**
 * 从外部 JSON 文件导入配置，与现有配置合并后保存
 * @param filePath - 配置文件的绝对路径
 * @returns 导入结果
 */
export function importConfig(filePath: string): { ok: boolean; msg: string } {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) return { ok: false, msg: '文件不存在' };
    // 读取并解析 JSON
    const raw = fs.readFileSync(filePath, 'utf-8');
    const imported = JSON.parse(raw);
    // 验证格式：必须是对象且不能是数组
    if (typeof imported !== 'object' || Array.isArray(imported)) return { ok: false, msg: '配置文件格式无效' };
    // 与现有配置合并后保存
    saveConfig({ ...loadConfig(), ...imported });
    return { ok: true, msg: `已导入 ${Object.keys(imported).length} 项配置` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, msg: `导入失败: ${msg}` };
  }
}

/**
 * 注册所有配置相关的 IPC 处理函数
 * @param ipcMain - Electron 主进程 IPC 实例
 */
export function registerConfigHandlers(ipcMain: Electron.IpcMain): void {
  // 获取配置（含脱敏 API Key）
  ipcMain.handle('config:get', () => getConfigForRenderer());
  // 保存配置（读-合并-写）
  ipcMain.handle('config:save', (_, config: Record<string, unknown>) => saveConfig(config));
  // 测试连接
  ipcMain.handle('config:testConnection', (_, config: Record<string, unknown>) => testConnection(config));
  // 导出配置
  ipcMain.handle('config:export', () => getConfigExport());
  // 导入配置
  ipcMain.handle('config:import', (_, filePath: string) => importConfig(filePath));

  // CLI 检测
  ipcMain.handle('cli:detect', () => {
    const path = detectCli();
    return { found: !!path, path };
  });

  // CLI 安装（异步，带进度回调）
  ipcMain.handle('cli:install', async (_, useNpx: boolean) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return { ok: false, error: '无可用窗口' };

    const sendProgress = (msg: string) => {
      window.webContents.send('cli-install-progress', msg);
    };

    try {
      if (useNpx) {
        // 方案 A：通过 npx 临时调用（无需全局安装）
        sendProgress('使用 npx 模式，无需全局安装');
        return { ok: true, mode: 'npx', path: 'npx' };
      } else {
        // 方案 B：全局 npm 安装
        const result = await installCli(sendProgress);
        return result;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  });

  // 从 Claude CLI 配置导入
  ipcMain.handle('config:importFromClaude', () => {
    const cliConfig = readClaudeCliConfig();
    if (!cliConfig.hasConfig) {
      return { ok: false, msg: '未找到 Claude CLI 配置 (~/.claude/settings.json)' };
    }

    // 将提取的配置合并到应用配置
    const updates: Record<string, unknown> = {};
    if (cliConfig.apiKey) {
      // 加密存储 API Key
      updates.apiKey = encryptValue(cliConfig.apiKey);
    }
    if (cliConfig.baseUrl) {
      updates.gatewayUrl = cliConfig.baseUrl;
    }
    if (cliConfig.model) {
      updates.model = cliConfig.model;
    }
    saveConfig(updates);

    const imported = [];
    if (cliConfig.apiKey) imported.push('API Key');
    if (cliConfig.baseUrl) imported.push('网关地址');
    if (cliConfig.model) imported.push('模型');
    return { ok: true, msg: `已导入: ${imported.join(', ')}` };
  });
}
