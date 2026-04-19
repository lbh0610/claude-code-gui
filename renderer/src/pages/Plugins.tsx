import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface Plugin {
  id: string;
  name: string;
  version: string;
  enabled: number;
  source: string | null;
  created_at: string;
}

const BUILTIN_PLUGINS = [
  { id: 'core-cli', name: 'CLI 核心', version: '0.1.0', desc: 'CLI 进程管理核心模块', source: 'built-in' },
  { id: 'config-mgr', name: '配置管理', version: '0.1.0', desc: '配置读写与加密存储', source: 'built-in' },
  { id: 'session-mgr', name: '会话管理', version: '0.1.0', desc: '会话生命周期管理', source: 'built-in' },
  { id: 'log-sys', name: '日志系统', version: '0.1.0', desc: '结构化日志与诊断', source: 'built-in' },
  { id: 'updater', name: '更新管理器', version: '0.1.0', desc: '版本检查与离线补丁', source: 'built-in' },
];

export default function Plugins() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    const data = await api.plugin.list() as Plugin[];
    // 合并内置插件
    const existingIds = new Set(data.map((p: Plugin) => p.id));
    const builtins = BUILTIN_PLUGINS.filter((b) => !existingIds.has(b.id));
    const all = [...data, ...builtins.map((b) => ({
      ...b,
      enabled: 1,
      created_at: new Date().toISOString(),
    }))];
    setPlugins(all);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    if (BUILTIN_PLUGINS.find((b) => b.id === id)) return; // 内置插件不能禁用
    await api.plugin.toggle(id, enabled);
    loadPlugins();
  };

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--cyan)' }}>
        插件管理
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {plugins.map((plugin) => (
          <div
            key={plugin.id}
            className="card"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              opacity: plugin.enabled ? 1 : 0.6,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {plugin.name}
                <span style={{
                  fontSize: 10,
                  marginLeft: 8,
                  padding: '2px 6px',
                  borderRadius: 3,
                  background: plugin.source === 'built-in' ? 'rgba(0,229,255,0.1)' : 'rgba(124,77,255,0.1)',
                  color: plugin.source === 'built-in' ? 'var(--cyan)' : 'var(--purple)',
                }}>
                  {plugin.source || 'local'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                v{plugin.version} · {plugin.id}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span style={{ fontSize: 11, color: plugin.enabled ? 'var(--success)' : 'var(--text-dim)' }}>
                {plugin.enabled ? '已启用' : '已禁用'}
              </span>
              {plugin.source !== 'built-in' && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleToggle(plugin.id, !plugin.enabled)}
                >
                  {plugin.enabled ? '禁用' : '启用'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
