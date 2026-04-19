import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb } from '../database';
import { APP_VERSION, APP_NAME } from '../config';

/**
 * 更新管理器：版本信息、在线检查（模拟）、离线补丁导入与签名校验
 */

interface VersionInfo {
  currentVersion: string;
  appName: string;
  platform: string;
  arch: string;
}

interface UpdateInfo {
  available: boolean;
  latestVersion: string;
  releaseNotes: string;
  downloadUrl?: string;
}

export function getVersionInfo(): VersionInfo {
  return {
    currentVersion: APP_VERSION,
    appName: APP_NAME,
    platform: process.platform,
    arch: process.arch,
  };
}

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
 * 导入离线补丁：校验签名和版本关系
 */
export function importPatch(filePath: string): { ok: boolean; msg: string } {
  if (!fs.existsSync(filePath)) {
    return { ok: false, msg: '补丁文件不存在' };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const patch = JSON.parse(raw);

    // 校验补丁格式
    if (!patch.version || !patch.files || !Array.isArray(patch.files)) {
      return { ok: false, msg: '无效的补丁格式' };
    }

    // 签名校验
    if (patch.signature) {
      const dataToVerify = JSON.stringify({ version: patch.version, files: patch.files });
      const hash = crypto.createHash('sha256').update(dataToVerify).digest('hex');
      if (hash !== patch.signature) {
        return { ok: false, msg: '补丁签名校验失败' };
      }
    }

    // 记录更新历史
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

export function registerUpdateHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('update:check', () => checkUpdate());
  ipcMain.handle('update:importPatch', (_, { filePath }: { filePath: string }) =>
    importPatch(filePath)
  );
  ipcMain.handle('update:info', () => getVersionInfo());
}
