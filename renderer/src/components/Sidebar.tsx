// 引入状态钩子
import { useState } from 'react';
// 引入路由链接组件，用于页面导航
import { NavLink } from 'react-router-dom';

// 导航项配置：路径、图标、标签
const NAV_ITEMS = [
  { path: '/', icon: '⌂', label: '首页' },
  { path: '/workspace', icon: '◫', label: '项目工作区' },
  { path: '/sessions', icon: '◷', label: '会话历史' },
  { path: '/knowledge', icon: '📚', label: '知识库' },
  { path: '/logs', icon: '☰', label: '日志诊断' },
  { path: '/settings', icon: '⚙', label: '设置中心' },
  { path: '/skills', icon: '★', label: 'Skills 管理' },
  { path: '/plugins', icon: '⊞', label: '系统诊断' },
];

// 侧边栏组件：渲染导航菜单
export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav style={{
      width: collapsed ? 56 : 200,
      background: 'var(--bg-card)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 12,
      transition: 'width 0.2s ease',
      overflow: 'hidden',
    }}>
      <div style={{ flex: 1 }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: collapsed ? '10px 0' : '10px 16px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              textDecoration: 'none',
              color: isActive ? 'var(--cyan)' : 'var(--text-secondary)',
              background: isActive ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
              borderLeft: isActive ? '3px solid var(--cyan)' : '3px solid transparent',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            })}
            title={item.label}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}
      </div>

      {/* 底部折叠按钮 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: collapsed ? '12px 0' : '12px 16px',
          background: 'transparent',
          border: 'none',
          borderTop: '1px solid var(--border-color)',
          color: 'var(--text-dim)',
          cursor: 'pointer',
          fontSize: 14,
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>
          {collapsed ? '▸' : '◂'}
        </span>
        {!collapsed && <span style={{ marginLeft: 10, fontSize: 12 }}>收起</span>}
      </button>
    </nav>
  );
}
