import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface Session {
  id: string;
  name: string;
  project_dir: string;
  status: string;
  created_at: string;
  summary: string | null;
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const data = await api.session.list();
    setSessions(data as Session[]);
  };

  const filtered = sessions.filter((s) => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.project_dir.toLowerCase().includes(search.toLowerCase());
    const matchProject = !filterProject || s.project_dir === filterProject;
    return matchSearch && matchProject;
  });

  const projects = [...new Set(sessions.map((s) => s.project_dir))];

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--cyan)' }}>
        会话历史
      </h1>

      {/* 筛选区 */}
      <div className="flex gap-3" style={{ marginBottom: 20 }}>
        <input
          className="input"
          placeholder="搜索会话名称或项目路径..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 300 }}
        />
        {projects.length > 0 && (
          <select
            className="select"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="">全部项目</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p.split('/').pop()}</option>
            ))}
          </select>
        )}
      </div>

      {/* 会话列表 */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          暂无会话
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((s) => (
            <div key={s.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {s.project_dir}
                </div>
                {s.summary && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {s.summary}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {new Date(s.created_at).toLocaleString('zh-CN')}
                </span>
                <span className={`status-dot ${s.status === 'idle' ? 'idle' : 'running'}`} />
                <button
                  className="btn btn-danger btn-sm"
                  onClick={async () => {
                    await api.session.delete(s.id);
                    loadSessions();
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
