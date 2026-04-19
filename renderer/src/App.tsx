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

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
        }}>
          <TopBar />
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, overflow: 'hidden', background: 'var(--bg-primary)' }}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/workspace" element={<Workspace />} />
                <Route path="/sessions" element={<Sessions />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/plugins" element={<Plugins />} />
                <Route path="/updates" element={<Updates />} />
              </Routes>
            </main>
          </div>
        </div>
      </HashRouter>
    </QueryClientProvider>
  );
}
