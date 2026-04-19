import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function TopBar() {
  const [search, setSearch] = useState('');

  return (
    <header style={{
      height: 48,
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 16,
    }}>
      {/* Logo */}
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--cyan)',
        letterSpacing: 1,
      }}>
        AGENT WORKBENCH
      </div>

      {/* 全局搜索 */}
      <div style={{
        flex: 1,
        maxWidth: 400,
      }}>
        <input
          className="input"
          placeholder="搜索项目、会话、日志..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '6px 12px', fontSize: 12 }}
        />
      </div>

      {/* 右侧图标 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginLeft: 'auto',
      }}>
        <VersionBadge />
      </div>
    </header>
  );
}

function VersionBadge() {
  const [version, setVersion] = useState('0.1.0');

  useEffect(() => {
    api.app.getVersion().then((v) => setVersion(v)).catch(() => {});
  });

  return (
    <span style={{
      fontSize: 11,
      padding: '3px 8px',
      background: 'rgba(0, 229, 255, 0.1)',
      color: 'var(--cyan)',
      borderRadius: 4,
      border: '1px solid rgba(0, 229, 255, 0.2)',
    }}>
      v{version}
    </span>
  );
}
