// 引入状态管理和副作用钩子
import { useState, useEffect } from 'react';
// 引入 API 实例
import { api } from '../lib/api';

// 顶部栏组件：Logo、搜索框、版本信息
export default function TopBar() {
  // 搜索框输入状态
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

// 版本徽标组件：从 API 获取当前版本号
function VersionBadge() {
  const [version, setVersion] = useState('0.1.0');

  // 组件挂载时获取版本号
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
