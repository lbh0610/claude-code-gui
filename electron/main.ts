// Electron 主进程入口
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { ensureDirs, detectCli, readClaudeCliConfig, CONFIG_PATH } from './config';
import { closeDb } from './database';
import { registerConfigHandlers } from './handlers/config-manager';
import { registerCliHandlers, setMainWindow, getStatus } from './handlers/cli-manager';
import { registerSessionHandlers } from './handlers/session-manager';
import { registerLogHandlers } from './handlers/log-manager';
import { registerPluginHandlers } from './handlers/plugin-manager';
import { registerSkillHandlers } from './handlers/skill-manager';
import { registerDiagnosticHandlers } from './handlers/diagnostics-manager';
import { registerUpdateHandlers } from './handlers/updater';
import { registerKnowledgeHandlers } from './handlers/knowledge-manager';
import { registerTemplateHandlers } from './handlers/template-manager';
import { registerToolHandlers } from './handlers/tool-manager';
import { APP_VERSION, APP_NAME } from './config';
import { addLog } from './handlers/log-manager';
import { saveConfig } from './handlers/config-manager';
import fs from 'node:fs';

// 主窗口引用
let mainWindow: BrowserWindow | null = null;

/**
 * 首次启动时自动从 Claude CLI 配置导入
 * 仅在 config.json 不存在且 ~/.claude/settings.json 有配置时执行
 */
function autoImportFromClaudeCli(): void {
  if (fs.existsSync(CONFIG_PATH)) {
    addLog('app', 'info', 'auto_import_skipped', '配置文件已存在，跳过自动导入');
    return;
  }

  const cliConfig = readClaudeCliConfig();
  if (!cliConfig.hasConfig) {
    addLog('app', 'info', 'auto_import_no_cli_config', '未找到 Claude CLI 配置');
    return;
  }

  const updates: Record<string, unknown> = {};
  if (cliConfig.apiKey) updates.apiKey = cliConfig.apiKey;
  if (cliConfig.baseUrl) updates.gatewayUrl = cliConfig.baseUrl;
  if (cliConfig.model) updates.model = cliConfig.model;

  if (Object.keys(updates).length > 0) {
    saveConfig(updates);
    const items = Object.keys(updates).join(', ');
    addLog('app', 'info', 'auto_imported', `已从 Claude CLI 自动导入配置: ${items}`);
  }
}

// 创建主窗口并配置窗口参数、安全策略及开发/生产环境加载逻辑
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0A1628',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  // 将主窗口引用注册到 CLI 管理器
  setMainWindow(mainWindow);

  // 开发模式加载 Vite dev server，生产模式加载构建产物
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'dist', 'index.html'));
  }

  // 快捷键 Cmd+Option+I / Ctrl+Shift+I 切换开发者工具
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isMac = process.platform === 'darwin';
    if (isMac && input.meta && input.alt && input.key === 'i') {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    } else if (!isMac && input.control && input.shift && input.key === 'I') {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // 窗口内容准备就绪后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 窗口关闭时检查是否有正在运行的 CLI 会话
  mainWindow.on('close', (e) => {
    const status = getStatus();
    if (status.status === 'running') {
      const { response } = require('electron').dialog.showMessageBoxSync(mainWindow!, {
        type: 'warning',
        buttons: ['取消', '直接退出'],
        defaultId: 0,
        cancelId: 0,
        title: '确认退出',
        message: 'CLI 会话正在运行中',
        detail: `当前有 ${status.sessionCount} 个活跃会话（PID: ${status.pid}）。\n确定要退出吗？`,
      });
      if (response === 0) {
        e.preventDefault();
      }
    }
  });

  // 窗口关闭时释放引用
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 注册所有 IPC 处理器，包括配置、CLI、会话、日志、插件、技能、诊断、更新、文件系统及基础应用信息
function registerHandlers(): void {
  registerConfigHandlers(ipcMain);
  registerCliHandlers(ipcMain);
  registerSessionHandlers(ipcMain);
  registerLogHandlers(ipcMain);
  registerPluginHandlers(ipcMain);
  registerSkillHandlers(ipcMain);
  registerDiagnosticHandlers(ipcMain);
  registerUpdateHandlers(ipcMain);
  registerKnowledgeHandlers(ipcMain);
  registerTemplateHandlers(ipcMain);
  registerToolHandlers(ipcMain);

  // 文件系统操作：选择目录
  const { dialog } = require('electron');
  ipcMain.handle('fs:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // 文件系统操作：读取文件内容
  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    const fs = await import('node:fs');
    return fs.readFileSync(filePath, 'utf-8');
  });

  // 文件系统操作：读取目录
  ipcMain.handle('fs:readdir', async (_, dirPath: string) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
      path: path.join(dirPath, e.name),
      size: e.isFile() ? fs.statSync(path.join(dirPath, e.name)).size : 0,
    }));
  });

  // 文件系统操作：获取文件/目录信息
  ipcMain.handle('fs:stat', async (_, filePath: string) => {
    const fs = await import('node:fs');
    const stat = fs.statSync(filePath);
    return {
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
    };
  });

  // 文件系统操作：读取图片文件转 base64 data URL
  ipcMain.handle('fs:readImage', async (_, filePath: string) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    const mimeType = mime[ext] || 'application/octet-stream';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  });

  // 文件系统操作：选择文件（支持图片+代码文件）
  ipcMain.handle('fs:selectFiles', async (_, filters: Array<{ name: string; extensions: string[] }> = []) => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: filters.length > 0 ? filters : [
        { name: 'Images & Code', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'rb', 'php', 'css', 'html', 'json', 'yaml', 'yml', 'md', 'sql', 'sh', 'toml'] },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  // 获取应用版本号
  ipcMain.handle('app:getVersion', () => APP_VERSION);

  // 获取应用运行平台信息（操作系统、架构、应用名称）
  ipcMain.handle('app:getPlatform', () => ({
    platform: process.platform,
    arch: process.arch,
    name: APP_NAME,
  }));
}

// 应用就绪后初始化目录、注册处理器、创建窗口并记录启动日志
app.whenReady().then(() => {
  ensureDirs();
  registerHandlers();

  // 首次启动自动从 Claude CLI 配置导入
  autoImportFromClaudeCli();

  createWindow();
  addLog('app', 'info', 'app_started', `应用已启动 v${APP_VERSION} (${process.platform} ${process.arch})`);

  // macOS 激活事件：无窗口时重新创建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时，非 macOS 平台退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前关闭数据库连接
app.on('before-quit', () => {
  closeDb();
});
