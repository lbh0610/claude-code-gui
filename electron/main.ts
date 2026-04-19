// Electron 主进程入口
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { ensureDirs } from './config';
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

// 主窗口引用
let mainWindow: BrowserWindow | null = null;

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
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'dist', 'index.html'));
  }

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
