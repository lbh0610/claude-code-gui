import { useState, useEffect } from 'react';
import { api } from '../lib/api';

const SETTINGS_SECTIONS = [
  { id: 'general', label: '通用' },
  { id: 'account', label: '账号与密钥' },
  { id: 'gateway', label: '模型与网关' },
  { id: 'proxy', label: '代理' },
  { id: 'update', label: '更新' },
];

export default function Settings() {
  const [activeSection, setActiveSection] = useState('account');
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.config.get().then(setConfig).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.config.save(config);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    const result = await api.config.testConnection(config);
    setTestResult(result);
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧菜单 */}
      <div style={{
        width: 180,
        borderRight: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        paddingTop: 12,
      }}>
        {SETTINGS_SECTIONS.map((s) => (
          <div
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              cursor: 'pointer',
              color: activeSection === s.id ? 'var(--cyan)' : 'var(--text-secondary)',
              background: activeSection === s.id ? 'rgba(0,229,255,0.08)' : 'transparent',
              borderLeft: activeSection === s.id ? '3px solid var(--cyan)' : '3px solid transparent',
            }}
          >
            {s.label}
          </div>
        ))}
      </div>

      {/* 右侧面板 */}
      <div style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: 'var(--text-primary)' }}>
          {SETTINGS_SECTIONS.find((s) => s.id === activeSection)?.label}
        </h2>

        {activeSection === 'account' && (
          <div style={{ maxWidth: 500 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              API Key
            </label>
            <input
              className="input"
              type="password"
              placeholder="sk-ant-..."
              value={String(config.apiKey || '')}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              style={{ marginBottom: 16 }}
            />

            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
              API Key 将在本地加密存储，不会上传到任何服务器
            </div>

            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
              <button className="btn btn-secondary" onClick={handleTest}>
                测试连接
              </button>
            </div>

            {testResult && (
              <div style={{
                marginTop: 16,
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 13,
                background: testResult.ok ? 'rgba(0,230,118,0.1)' : 'rgba(239,68,68,0.1)',
                color: testResult.ok ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${testResult.ok ? 'rgba(0,230,118,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}>
                {testResult.msg}
              </div>
            )}
          </div>
        )}

        {activeSection === 'gateway' && (
          <div style={{ maxWidth: 500 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              Base URL
            </label>
            <input
              className="input"
              placeholder="https://api.anthropic.com"
              value={String(config.gatewayUrl || '')}
              onChange={(e) => setConfig({ ...config, gatewayUrl: e.target.value })}
              style={{ marginBottom: 16 }}
            />

            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              模型
            </label>
            <input
              className="input"
              placeholder="claude-sonnet-4-6-20250514"
              value={String(config.model || '')}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              style={{ marginBottom: 16 }}
            />

            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}

        {activeSection === 'proxy' && (
          <div style={{ maxWidth: 500 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              代理地址
            </label>
            <input
              className="input"
              placeholder="http://127.0.0.1:7890"
              value={String(config.proxy || '')}
              onChange={(e) => setConfig({ ...config, proxy: e.target.value })}
              style={{ marginBottom: 16 }}
            />
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}

        {activeSection === 'update' && (
          <div style={{ maxWidth: 500 }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={Boolean(config.autoCheckUpdate)}
                onChange={(e) => setConfig({ ...config, autoCheckUpdate: e.target.checked })}
              />
              自动检查更新
            </label>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}

        {activeSection === 'general' && (
          <div style={{ maxWidth: 500 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              CLI 路径（留空使用内置版本）
            </label>
            <input
              className="input"
              placeholder="/usr/local/bin/claude"
              value={String(config.cliPath || '')}
              onChange={(e) => setConfig({ ...config, cliPath: e.target.value })}
              style={{ marginBottom: 16 }}
            />
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
