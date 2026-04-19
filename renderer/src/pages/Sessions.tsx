import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface Session {
  id: string;
  name: string;
  project_dir: string;
  tags: string;
  status: string;
  created_at: string;
  summary: string | null;
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingTags, setEditingTags] = useState<Record<string, boolean>>({});
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});

  useEffect(() => { loadSessions(); }, []);

  const loadSessions = async () => {
    const data = await api.session.list();
    setSessions(data as Session[]);
  };

  const allTags = [...new Set(sessions.flatMap(s => {
    try { return JSON.parse(s.tags || '[]') as string[]; } catch { return []; }
  }))];

  const filtered = sessions.filter((s) => {
    const tags: string[] = (() => { try { return JSON.parse(s.tags || '[]'); } catch { return []; } })();
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.project_dir.toLowerCase().includes(search.toLowerCase());
    const matchProject = !filterProject || s.project_dir === filterProject;
    const matchTag = !filterTag || tags.includes(filterTag);
    return matchSearch && matchProject && matchTag;
  });

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个会话？`)) return;
    for (const id of selectedIds) await api.session.delete(id);
    setSelectedIds(new Set());
    await loadSessions();
  };

  const handleSaveTags = async (id: string) => {
    const raw = tagInputs[id] || '';
    const tags = raw.split(',').map(t => t.trim()).filter(Boolean);
    await api.session.updateTags({ sessionId: id, tags });
    setEditingTags(prev => ({ ...prev, [id]: false }));
    await loadSessions();
  };

  const getTags = (s: Session): string[] => {
    try { return JSON.parse(s.tags || '[]'); } catch { return []; }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(s => s.id)));
  };

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--cyan)' }}>
        会话历史
      </h1>

      {/* 筛选区 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" placeholder="搜索..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 250, fontSize: 12 }} />
        {allTags.length > 0 && (
          <select className="select" value={filterTag} onChange={(e) => setFilterTag(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">全部标签</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {[...new Set(sessions.map(s => s.project_dir))].length > 0 && (
          <select className="select" value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">全部项目</option>
            {[...new Set(sessions.map(s => s.project_dir))].map(p => <option key={p} value={p}>{p.split('/').pop()}</option>)}
          </select>
        )}
        <div style={{ flex: 1 }} />
        {selectedIds.size > 0 && (
          <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}>删除选中 ({selectedIds.size})</button>
        )}
      </div>

      {/* 会话列表 */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          暂无会话
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 表头 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 11, color: 'var(--text-dim)' }}>
            <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
            <span>全选</span>
          </div>
          {filtered.map((s) => (
            <div key={s.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} style={{ cursor: 'pointer' }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {s.project_dir}
                </div>
                {/* 标签 */}
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {editingTags[s.id] ? (
                    <>
                      <input className="input" placeholder="标签，逗号分隔" value={tagInputs[s.id] || getTags(s).join(', ')}
                        onChange={(e) => setTagInputs(prev => ({ ...prev, [s.id]: e.target.value }))}
                        style={{ fontSize: 11, padding: '2px 6px', width: 180 }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveTags(s.id)} autoFocus />
                      <button className="btn btn-secondary btn-sm" onClick={() => handleSaveTags(s.id)} style={{ fontSize: 10 }}>保存</button>
                      <button className="btn btn-sm" onClick={() => setEditingTags(prev => ({ ...prev, [s.id]: false }))} style={{ fontSize: 10, color: 'var(--text-dim)' }}>取消</button>
                    </>
                  ) : (
                    <>
                      {getTags(s).map((t, i) => (
                        <span key={i} style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 3,
                          background: 'rgba(0,229,255,0.1)', color: 'var(--cyan)',
                        }}>{t}</span>
                      ))}
                      <button className="btn btn-sm" onClick={() => { setEditingTags(prev => ({ ...prev, [s.id]: true })); setTagInputs(prev => ({ ...prev, [s.id]: getTags(s).join(', ') })); }}
                        style={{ fontSize: 10, color: 'var(--text-dim)', padding: '1px 4px' }}>+ 标签</button>
                    </>
                  )}
                </div>
                {s.summary && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {s.summary}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {new Date(s.created_at).toLocaleString('zh-CN')}
                </span>
                <span className={`status-dot ${s.status === 'idle' ? 'idle' : 'running'}`} />
                <button className="btn btn-danger btn-sm" onClick={async () => {
                  await api.session.delete(s.id);
                  loadSessions();
                }}>
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
