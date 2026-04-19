// 引入路由链接组件，用于页面导航
import { NavLink } from 'react-router-dom';

// 导航项配置：路径、图标、标签
const NAV_ITEMS = [
  { path: '/', icon: '⌂', label: '首页' },
  { path: '/workspace', icon: '◫', label: '项目工作区' },
  { path: '/sessions', icon: '◷', label: '会话历史' },
  { path: '/logs', icon: '☰', label: '日志诊断' },
  { path: '/settings', icon: '⚙', label: '设置中心' },
  { path: '/skills', icon: '★', label: 'Skills 管理' },
  { path: '/plugins', icon: '⊞', label: '系统诊断' },
];

// 侧边栏组件：渲染导航菜单
export default function Sidebar() {
  return (
    <nav style={{
      width: 200,
      background: 'var(--bg-card)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 12,
    }}>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            textDecoration: 'none',
            color: isActive ? 'var(--cyan)' : 'var(--text-secondary)',
            background: isActive ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
            borderLeft: isActive ? '3px solid var(--cyan)' : '3px solid transparent',
            fontSize: 13,
            fontWeight: isActive ? 600 : 400,
            transition: 'all 0.15s ease',
          })}
        >
          <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
