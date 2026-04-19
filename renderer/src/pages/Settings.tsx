// 引入状态管理和副作用钩子
import { useState, useEffect } from 'react';
// 引入 API 实例
import { api } from '../lib/api';

// 设置菜单项配置
const SETTINGS_SECTIONS = [
  { id: 'general', label: '通用' },
  { id: 'systemPrompt', label: '系统提示词' },
  { id: 'account', label: '账号与密钥' },
  { id: 'gateway', label: '模型与网关' },
  { id: 'proxy', label: '代理' },
  { id: 'update', label: '更新' },
];

export default function Settings() {
  // 当前激活的设置面板 ID
  const [activeSection, setActiveSection] = useState('account');
  // 配置数据对象
  const [config, setConfig] = useState<Record<string, unknown>>({});
  // API Key 输入框值
  const [apiKeyInput, setApiKeyInput] = useState('');
  // 连接测试结果
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // 保存中状态
  const [saving, setSaving] = useState(false);

  // 挂载时加载配置
  useEffect(() => {
    api.config.get().then(cfg => {
      setConfig(cfg);
      // 从脱敏显示值初始化输入框
      const display = cfg.apiKeyDisplay as string | undefined;
      setApiKeyInput(display || '');
      // 同步主题设置
      if (cfg.theme && typeof cfg.theme === 'string') {
        onThemeChange?.(cfg.theme);
      }
    }).catch(() => {});
  }, []);

  // 保存配置到后端
  const handleSave = async () => {
    setSaving(true);
    try {
      const toSave = { ...config };
      // 只在用户输入了新 Key（非脱敏值）时才更新
      if (apiKeyInput && !apiKeyInput.startsWith('****') && apiKeyInput !== config.apiKeyDisplay) {
        toSave.apiKey = apiKeyInput;
      }
      await api.config.save(toSave);
    } finally {
      setSaving(false);
    }
  };

  // 测试 API 连接
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

        {/* API Key 设置 */}
        {activeSection === 'account' && (
          <div style={{ maxWidth: 500 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              API Key
            </label>
            <input
              className="input"
              type="password"
              placeholder={apiKeyInput ? '（已配置）' : 'sk-ant-...'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              style={{ marginBottom: 16 }}
            />

            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
              {apiKeyInput ? '已保存，修改后将覆盖原 Key' : 'API Key 将在本地加密存储，不会上传到任何服务器'}
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

        {/* 模型与网关 */}
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

        {/* 代理设置 */}
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

        {/* 更新设置 */}
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

        {/* 通用设置 */}
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

            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>配置导入/导出</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {/* 导出配置：生成 Blob 并触发下载 */}
              <button className="btn btn-secondary btn-sm" onClick={async () => {
                const data = await api.config.export();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `config-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
              }}>导出配置</button>
              {/* 导入配置：创建隐藏文件选择器 */}
              <button className="btn btn-secondary btn-sm" onClick={async () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  const result = await api.config.import(text);
                  alert(result.msg);
                  if (result.ok) api.config.get().then(setConfig).catch(() => {});
                };
                input.click();
              }}>导入配置</button>
            </div>

            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}

        {/* 系统提示词 */}
        {activeSection === 'systemPrompt' && (
          <div style={{ maxWidth: 500 }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={Boolean(config.enableSystemPrompt)}
                onChange={(e) => setConfig({ ...config, enableSystemPrompt: e.target.checked })}
              />
              启用系统提示词
            </label>

            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              系统提示词
            </label>
            <textarea
              className="input"
              rows={8}
              placeholder="输入自定义系统提示词..."
              value={String(config.systemPrompt || '')}
              onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
              style={{
                marginBottom: 16,
                fontFamily: 'monospace',
                resize: 'vertical',
              }}
            />

            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--text-secondary)' }}>
              快速预设
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setConfig({ ...config, systemPrompt: (config.systemPrompt as string || '') + '回答必须简洁，直接给出代码实现，不要冗长解释。' })}
              >
                简洁模式
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setConfig({ ...config, systemPrompt: (config.systemPrompt as string || '') + '所有代码注释使用中文编写。' })}
              >
                中文注释
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setConfig({ ...config, systemPrompt: (config.systemPrompt as string || '') + '你是一个资深前端工程师，擅长 React、TypeScript 和现代 Web 开发。' })}
              >
                前端专家
              </button>
            </div>

            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
