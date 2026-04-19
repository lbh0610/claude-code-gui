// 引入 React 状态管理和副作用钩子
import { useState, useEffect } from 'react';
// 引入路由：HashRouter 用于无服务器的路由，Routes/Route 定义路由规则
import { HashRouter, Routes, Route } from 'react-router-dom';
// 引入 React Query 客户端，用于数据缓存和异步状态管理
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// 引入布局组件
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
// 引入 Toast 组件
import { ToastProvider } from './components/Toast';
// 引入所有页面组件
import Home from './pages/Home';
import Workspace from './pages/Workspace';
import Sessions from './pages/Sessions';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import Plugins from './pages/Plugins';
import Updates from './pages/Updates';
import Skills from './pages/Skills';
import KnowledgeBase from './pages/KnowledgeBase';
import OnboardingWizard from './components/OnboardingWizard';
import { api } from './lib/api';

// 创建 React Query 客户端实例，用于全局数据缓存
const queryClient = new QueryClient();

export default function App() {
  // 主题状态，初始化时优先读取 localStorage
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme');
    return stored || 'light';
  });
  // 首次启动引导状态
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('hasSeenOnboarding');
  });

  // 组件挂载时：同步 localStorage 和配置中的主题
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored) {
      // 有本地记录则直接用
      document.documentElement.setAttribute('data-theme', stored);
    } else {
      // 首次加载则从后端读取
      api.config.get().then(cfg => {
        if (cfg.theme && typeof cfg.theme === 'string') {
          setTheme(cfg.theme);
        }
      }).catch(() => {});
    }
  }, []);

  // 主题变化时更新 DOM 属性
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ToastProvider>
          <div
            style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            width: '100vw',
            overflow: 'hidden',
          }}
        >
          <TopBar theme={theme} onThemeChange={setTheme} />
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, overflow: 'hidden' }}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/workspace" element={<Workspace theme={theme} onThemeChange={setTheme} />} />
                <Route path="/sessions" element={<Sessions />} />
                <Route path="/knowledge" element={<KnowledgeBase />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/plugins" element={<Plugins />} />
                <Route path="/updates" element={<Updates />} />
                <Route path="/skills" element={<Skills />} />
              </Routes>
            </main>
          </div>
        </div>
        {showOnboarding && <OnboardingWizard onComplete={() => { localStorage.setItem('hasSeenOnboarding', '1'); setShowOnboarding(false); }} />}
        </ToastProvider>
      </HashRouter>
    </QueryClientProvider>
  );
}
