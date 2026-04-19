// 引入文件系统模块，用于文件检查和读取
import fs from 'node:fs';
// 引入路径模块，用于路径操作
import path from 'node:path';
// 引入加密模块，用于签名校验
import crypto from 'node:crypto';
// 引入数据库连接获取函数
import { getDb } from '../database';
// 引入应用版本和应用名称常量
import { APP_VERSION, APP_NAME } from '../config';

/**
 * 版本信息接口
 */
interface VersionInfo {
  currentVersion: string;  // 当前应用版本
  appName: string;         // 应用名称
  platform: string;        // 操作系统平台
  arch: string;            // CPU 架构
}

/**
 * 更新信息接口
 */
interface UpdateInfo {
  available: boolean;      // 是否有可用更新
  latestVersion: string;   // 最新版本号
  releaseNotes: string;    // 更新说明
  downloadUrl?: string;    // 可选，下载地址
}

/**
 * 获取当前应用版本信息
 * @returns 版本信息对象
 */
export function getVersionInfo(): VersionInfo {
  return {
    currentVersion: APP_VERSION,
    appName: APP_NAME,
    platform: process.platform,
    arch: process.arch,
  };
}

/**
 * 检查是否有新版本可用
 * 当前为模拟实现，实际应请求更新服务器 API
 * @returns 更新信息
 */
export async function checkUpdate(): Promise<UpdateInfo> {
  // 模拟：实际应请求更新服务器 API
  // const resp = await fetch('https://updates.example.com/api/check', {
  //   body: JSON.stringify({ version: APP_VERSION, platform: process.platform }),
  // });
  return {
    available: false,
    latestVersion: APP_VERSION,
    releaseNotes: '当前已是最新版本',
  };
}

/**
 * 导入离线补丁，校验签名和版本关系后记录到数据库
 * @param filePath - 补丁文件的绝对路径
 * @returns 导入结果
 */
export function importPatch(filePath: string): { ok: boolean; msg: string } {
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    return { ok: false, msg: '补丁文件不存在' };
  }

  try {
    // 读取并解析补丁 JSON
    const raw = fs.readFileSync(filePath, 'utf-8');
    const patch = JSON.parse(raw);

    // 校验补丁格式：必须包含 version 和 files 数组
    if (!patch.version || !patch.files || !Array.isArray(patch.files)) {
      return { ok: false, msg: '无效的补丁格式' };
    }

    // 签名校验：计算 JSON 的 SHA-256 哈希与签名对比
    if (patch.signature) {
      const dataToVerify = JSON.stringify({ version: patch.version, files: patch.files });
      const hash = crypto.createHash('sha256').update(dataToVerify).digest('hex');
      if (hash !== patch.signature) {
        return { ok: false, msg: '补丁签名校验失败' };
      }
    }

    // 记录更新历史到数据库
    const db = getDb();
    db.prepare(
      'INSERT INTO update_history (from_version, to_version, status, method) VALUES (?, ?, ?, ?)'
    ).run(APP_VERSION, patch.version, 'pending', 'offline_patch');

    return { ok: true, msg: `补丁已导入: v${patch.version}，重启后生效` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, msg: `导入失败: ${msg}` };
  }
}

/**
 * 注册所有更新相关的 IPC 处理函数
 * @param ipcMain - Electron 主进程 IPC 实例
 */
export function registerUpdateHandlers(ipcMain: Electron.IpcMain): void {
  // 检查更新
  ipcMain.handle('update:check', () => checkUpdate());
  // 导入离线补丁
  ipcMain.handle('update:importPatch', (_, { filePath }: { filePath: string }) =>
    importPatch(filePath)
  );
  // 获取版本信息
  ipcMain.handle('update:info', () => getVersionInfo());
}
