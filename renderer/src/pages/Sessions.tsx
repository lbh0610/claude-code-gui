// 引入状态管理和副作用钩子
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
// 引入 API 实例
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

// 会话数据接口
interface Session {
  id: string;           // 会话唯一标识
  name: string;         // 会话名称
  project_dir: string;  // 项目目录路径
  tags: string;         // 标签数组的 JSON 字符串
  status: string;       // 会话状态
  created_at: string;   // 创建时间
  summary: string | null;  // 会话摘要
  pinned?: number;      // 置顶标记
}

// 会话统计接口
interface SessionStats {
  messageCount: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastMessage: { role: string; content: string; timestamp: number } | null;
}

export default function Sessions() {
  const navigate = useNavigate();
  const toast = useToast();
  // 会话列表
  const [sessions, setSessions] = useState<Session[]>([]);
  // 每个会话的统计信息
  const [statsMap, setStatsMap] = useState<Record<string, SessionStats>>({});
  // 搜索关键词
  const [search, setSearch] = useState('');
  // 按项目过滤
  const [filterProject, setFilterProject] = useState('');
  // 按标签过滤
  const [filterTag, setFilterTag] = useState('');
  // 排序方式
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'cost' | 'name'>('updated');
  // 批量选中的会话 ID 集合
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 标签编辑状态
  const [editingTags, setEditingTags] = useState<Record<string, boolean>>({});
  // 标签编辑输入框的值
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});
  // 展开统计详情的会话 ID
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // 挂载时加载会话列表
  useEffect(() => { loadSessions(); }, []);

  // 从 API 加载会话列表和统计
  const loadSessions = async () => {
    const data = await api.session.list();
    const list = data as Session[];
    setSessions(list);
    // 加载每个会话的统计信息
    const newStats: Record<string, SessionStats> = {};
    for (const s of list) {
      try {
        const stats = await api.session.stats(s.id);
        newStats[s.id] = stats;
      } catch { /* 忽略 */ }
    }
    setStatsMap(newStats);
    setSelectedIds(new Set());
  };

  // 打开会话（跳转到工作区）
  const handleOpenSession = useCallback((s: Session) => {
    navigate('/workspace', { state: { sessionId: s.id, projectDir: s.project_dir } });
  }, [navigate]);

  // 导出会话为 Markdown
  const handleExport = async (id: string) => {
    try {
      const result = await api.session.exportSession(id);
      const blob = new Blob([result.content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error('导出失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // 置顶/取消置顶
  const handleTogglePin = async (id: string, pinned: boolean) => {
    await api.session.togglePin({ sessionId: id, pinned });
    await loadSessions();
  };

  // 批量删除选中的会话
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个会话？`)) return;
    for (const id of selectedIds) await api.session.delete(id);
    setSelectedIds(new Set());
    await loadSessions();
  };

  // 保存标签
  const handleSaveTags = async (id: string) => {
    const raw = tagInputs[id] || '';
    const tags = raw.split(',').map(t => t.trim()).filter(Boolean);
    await api.session.updateTags({ sessionId: id, tags });
    setEditingTags(prev => ({ ...prev, [id]: false }));
    await loadSessions();
  };

  // 解析标签
  const getTags = (s: Session): string[] => {
    try { return JSON.parse(s.tags || '[]'); } catch { return []; }
  };

  // 切换选中
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(s => s.id)));
  };

  // 提取所有唯一标签
  const allTags = [...new Set(sessions.flatMap(s => {
    try { return JSON.parse(s.tags || '[]') as string[]; } catch { return []; }
  }))];

  // 过滤 + 排序
  const filtered = (() => {
    let result = sessions.filter((s) => {
      const tags: string[] = (() => { try { return JSON.parse(s.tags || '[]'); } catch { return []; } })();
      const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.project_dir.toLowerCase().includes(search.toLowerCase());
      const matchProject = !filterProject || s.project_dir === filterProject;
      const matchTag = !filterTag || tags.includes(filterTag);
      return matchSearch && matchProject && matchTag;
    });

    // 排序
    result.sort((a, b) => {
      // 置顶始终在前
      if ((a.pinned || 0) !== (b.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
      switch (sortBy) {
        case 'cost':
          return (statsMap[b.id]?.totalCost || 0) - (statsMap[a.id]?.totalCost || 0);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0; // 默认按 updated（数据库已排好）
      }
    });
    return result;
  })();

  // 格式化 token
  const fmtTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return `${n}`;
  };

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--cyan)' }}>
        会话历史
      </h1>

      {/* 筛选和排序区 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" placeholder="搜索会话名称或项目..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 250, fontSize: 12 }} />
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
        <select className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} style={{ fontSize: 12 }}>
          <option value="updated">最近更新</option>
          <option value="created">创建时间</option>
          <option value="cost">费用高低</option>
          <option value="name">名称排序</option>
        </select>
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
          {/* 全选表头 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 11, color: 'var(--text-dim)' }}>
            <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
            <span>全选</span>
            <span style={{ flex: 1 }} />
            <span>{filtered.length} 个会话</span>
          </div>
          {filtered.map((s) => {
            const stats = statsMap[s.id];
            const isExpanded = expandedSession === s.id;
            return (
              <div key={s.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* 主行 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => handleOpenSession(s)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} onClick={(e) => e.stopPropagation()} style={{ cursor: 'pointer' }} />
                      {s.pinned ? <span title="已置顶" style={{ fontSize: 12 }}>📌</span> : null}
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
                    {/* 统计概览 */}
                    {stats && stats.messageCount > 0 && (
                      <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                        <span>{stats.messageCount} 条消息</span>
                        <span>${stats.totalCost.toFixed(4)}</span>
                        <span>输入 {fmtTokens(stats.totalInputTokens)}</span>
                        <span>输出 {fmtTokens(stats.totalOutputTokens)}</span>
                      </div>
                    )}
                    {/* 最后一条消息预览 */}
                    {stats?.lastMessage && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, maxWidth: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: stats.lastMessage.role === 'user' ? 'var(--cyan)' : 'var(--text-secondary)' }}>
                          {stats.lastMessage.role === 'user' ? '你' : 'AI'}：
                        </span>
                        {stats.lastMessage.content.slice(0, 120)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {new Date(s.created_at).toLocaleString('zh-CN')}
                    </span>
                    <span className={`status-dot ${s.status === 'idle' ? 'idle' : 'running'}`} />
                    {/* 操作按钮组 */}
                    <button className="btn btn-secondary btn-sm" onClick={() => handleOpenSession(s)} style={{ fontSize: 10 }} title="打开会话">打开</button>
                    <button className="btn btn-sm" onClick={() => handleTogglePin(s.id, !s.pinned)} style={{ fontSize: 10, color: 'var(--text-dim)' }} title={s.pinned ? '取消置顶' : '置顶'}>
                      {s.pinned ? '📌' : '📍'}
                    </button>
                    <button className="btn btn-sm" onClick={() => handleExport(s.id)} style={{ fontSize: 10, color: 'var(--text-dim)' }} title="导出为 Markdown">导出</button>
                    <button className="btn btn-danger btn-sm" onClick={async () => {
                      if (confirm(`确定删除会话 "${s.name}"？`)) {
                        await api.session.delete(s.id);
                        loadSessions();
                      }
                    }} style={{ fontSize: 10 }}>
                      删除
                    </button>
                  </div>
                </div>
                {/* 展开详情 */}
                {isExpanded && (
                  <div style={{ padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div><span style={{ color: 'var(--text-dim)' }}>消息总数:</span> {stats?.messageCount ?? 0}</div>
                      <div><span style={{ color: 'var(--text-dim)' }}>总费用:</span> ${stats?.totalCost.toFixed(4) ?? '0.0000'}</div>
                      <div><span style={{ color: 'var(--text-dim)' }}>输入 Token:</span> {stats?.totalInputTokens ?? 0}</div>
                      <div><span style={{ color: 'var(--text-dim)' }}>输出 Token:</span> {stats?.totalOutputTokens ?? 0}</div>
                      {s.summary && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-dim)' }}>摘要:</span> {s.summary}</div>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
