import { useState, useEffect } from 'react';
import { api } from '../lib/api';

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
}

interface UpdateRecord {
  id: number;
  from_version: string | null;
  to_version: string | null;
  status: string | null;
  applied_at: string;
  method: string | null;
}

export default function Updates() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api.update.info().then((info) => setVersionInfo(info as VersionInfo)).catch(() => {});
  }, []);

  const handleCheckUpdate = async () => {
    setChecking(true);
    try {
      const info = await api.update.check() as UpdateInfo;
      setUpdateInfo(info);
    } finally {
      setChecking(false);
    }
  };

  const handleImportPatch = async () => {
    // 在 Electron 中应使用 dialog.showOpenDialog，这里简化处理
    alert('请选择离线补丁文件（.json）\n\n此功能需要在 Electron 环境中使用文件选择对话框');
  };

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--cyan)' }}>
        更新管理
      </h1>

      {/* 当前版本 */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>当前版本</h3>
        {versionInfo && (
          <div style={{ fontSize: 13, lineHeight: 2 }}>
            <div><span style={{ color: 'var(--text-dim)' }}>应用名称:</span> {versionInfo.appName}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>版本号:</span> v{versionInfo.currentVersion}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>平台:</span> {versionInfo.platform}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>架构:</span> {versionInfo.arch}</div>
          </div>
        )}
      </div>

      {/* 检查更新 */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>在线更新</h3>
        <button className="btn btn-primary" onClick={handleCheckUpdate} disabled={checking}>
          {checking ? '检查中...' : '检查更新'}
        </button>

        {updateInfo && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              padding: 12,
              borderRadius: 6,
              background: updateInfo.available ? 'rgba(0,230,118,0.1)' : 'rgba(158,167,192,0.1)',
              border: `1px solid ${updateInfo.available ? 'rgba(0,230,118,0.3)' : 'var(--border-color)'}`,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {updateInfo.available ? '发现新版本' : '当前已是最新版本'}
              </div>
              {updateInfo.latestVersion && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  最新版本: v{updateInfo.latestVersion}
                </div>
              )}
              {updateInfo.releaseNotes && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                  {updateInfo.releaseNotes}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 离线补丁 */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>离线补丁</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          在无网络环境中，可导入离线补丁包进行更新。补丁包需从有网络环境的设备下载后传输至此。
        </p>
        <button className="btn btn-secondary" onClick={handleImportPatch}>
          导入离线补丁
        </button>
      </div>

      {/* 升级记录 */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>升级记录</h3>
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>
          暂无升级记录
        </div>
      </div>
    </div>
  );
}
