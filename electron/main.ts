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
import { registerUpdateHandlers } from './handlers/updater';
import { APP_VERSION, APP_NAME } from './config';

let mainWindow: BrowserWindow | null = null;

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

  setMainWindow(mainWindow);

  // 开发模式加载 Vite dev server，生产模式加载构建产物
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 注册所有 IPC handler
function registerHandlers(): void {
  registerConfigHandlers(ipcMain);
  registerCliHandlers(ipcMain);
  registerSessionHandlers(ipcMain);
  registerLogHandlers(ipcMain);
  registerPluginHandlers(ipcMain);
  registerSkillHandlers(ipcMain);
  registerUpdateHandlers(ipcMain);

  // 文件系统操作
  const { dialog } = require('electron');
  ipcMain.handle('fs:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('fs:readFile', async (_, filePath: string) => {
    const fs = await import('node:fs');
    return fs.readFileSync(filePath, 'utf-8');
  });

  // 应用信息
  ipcMain.handle('app:getVersion', () => APP_VERSION);
  ipcMain.handle('app:getPlatform', () => ({
    platform: process.platform,
    arch: process.arch,
    name: APP_NAME,
  }));
}

// 应用生命周期
app.whenReady().then(() => {
  ensureDirs();
  registerHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  closeDb();
});
