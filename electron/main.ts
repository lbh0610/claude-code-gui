// Electron 主进程入口
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { ensureDirs, detectCli, readClaudeCliConfig, CONFIG_PATH } from './config';
import { closeDb } from './database';
import { registerConfigHandlers } from './handlers/config-manager';
import { registerCliHandlers, setMainWindow } from './handlers/cli-manager';
import { registerSessionHandlers } from './handlers/session-manager';
import { registerLogHandlers } from './handlers/log-manager';
import { registerPluginHandlers } from './handlers/plugin-manager';
import { registerSkillHandlers } from './handlers/skill-manager';
import { registerDiagnosticHandlers } from './handlers/diagnostics-manager';
import { registerUpdateHandlers } from './handlers/updater';
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
