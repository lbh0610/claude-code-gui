import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Home from './pages/Home';
import Workspace from './pages/Workspace';
import Sessions from './pages/Sessions';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import Plugins from './pages/Plugins';
import Updates from './pages/Updates';
import Skills from './pages/Skills';
import { api } from './lib/api';

const queryClient = new QueryClient();

export default function App() {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme');
    return stored || 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    // 加载主题时也从配置读取
    api.config.get().then(cfg => {
      if (cfg.theme && typeof cfg.theme === 'string') {
        setTheme(cfg.theme);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            width: '100vw',
            overflow: 'hidden',
          }}
        >
          <TopBar />
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, overflow: 'hidden' }}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/workspace" element={<Workspace theme={theme} onThemeChange={setTheme} />} />
                <Route path="/sessions" element={<Sessions />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/plugins" element={<Plugins />} />
                <Route path="/updates" element={<Updates />} />
                <Route path="/skills" element={<Skills />} />
              </Routes>
            </main>
          </div>
        </div>
      </HashRouter>
    </QueryClientProvider>
  );
}
