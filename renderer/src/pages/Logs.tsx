import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';

interface LogEntry {
  id: number;
  timestamp: string;
  component: string | null;
  level: string;
  event: string | null;
  summary: string | null;
  session_id: string | null;
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState('');
  const [filterComponent, setFilterComponent] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => { loadLogs(); }, [filterLevel, filterComponent]);

  const loadLogs = async () => {
    const data = await api.log.list({
      level: filterLevel || undefined,
      component: filterComponent || undefined,
      search: search.trim() || undefined,
      limit: 500,
    });
    setLogs(data as LogEntry[]);
    setSelectedIds(new Set());
  };

  const handleDelete = async (id: number) => {
    await api.log.delete(id);
    if (selectedLog?.id === id) setSelectedLog(null);
    await loadLogs();
  };

  const handleClear = async () => {
    if (!confirm('确定清空全部日志？此操作不可恢复。')) return;
    await api.log.clear();
    setLogs([]);
    setSelectedLog(null);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条日志？`)) return;
    for (const id of selectedIds) await api.log.delete(id);
    setSelectedIds(new Set());
    setSelectedLog(null);
    await loadLogs();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === logs.length ? new Set() : new Set(logs.map(l => l.id)));
  };

  const components = useMemo(() => [...new Set(logs.map(l => l.component).filter(Boolean))], [logs]);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 主区域 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* 筛选区 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', flexWrap: 'wrap',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <select className="select" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">全部级别</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <select className="select" value={filterComponent} onChange={(e) => setFilterComponent(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">全部组件</option>
            {components.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="input" placeholder="搜索事件/摘要..." value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadLogs()} style={{ fontSize: 12, width: 200 }} />
          <button className="btn btn-secondary btn-sm" onClick={loadLogs}>刷新</button>
          <div style={{ flex: 1 }} />
          {selectedIds.size > 0 && (
            <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>删除选中 ({selectedIds.size})</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => {
            api.log.export(`/tmp/logs-${Date.now()}.json`, 'json').then(() => alert('已导出到 /tmp'));
          }}>导出 JSON</button>
          <button className="btn btn-danger btn-sm" onClick={handleClear}>清空全部</button>
        </div>

        {/* 日志列表 */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
              {search || filterLevel || filterComponent ? '无匹配日志' : '暂无日志记录 — 操作应用后会自动生成'}
            </div>
          ) : (
            <div style={{ fontSize: 12 }}>
              {/* 表头 */}
              <div style={{
                display: 'grid', gridTemplateColumns: '32px 150px 72px 90px 1fr 60px', gap: 8,
                padding: '8px 16px', borderBottom: '1px solid var(--border-color)',
                color: 'var(--text-dim)', fontWeight: 600,
              }}>
                <span>
                  <input type="checkbox" checked={selectedIds.size === logs.length && logs.length > 0}
                    onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </span>
                <span>时间</span>
                <span>级别</span>
                <span>组件</span>
                <span>事件</span>
                <span>操作</span>
              </div>
              {logs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '32px 150px 72px 90px 1fr 60px', gap: 8,
                    padding: '6px 16px', borderBottom: '1px solid rgba(34,58,96,0.2)',
                    cursor: 'pointer', alignItems: 'center',
                    background: selectedLog?.id === log.id ? 'rgba(0,229,255,0.05)' : selectedIds.has(log.id) ? 'rgba(0,229,255,0.03)' : 'transparent',
                  }}
                  onClick={() => setSelectedLog(log)}
                >
                  <span onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(log.id)} onChange={() => toggleSelect(log.id)}
                      style={{ cursor: 'pointer' }} />
                  </span>
                  <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{log.timestamp}</span>
                  <span style={{
                    color: log.level === 'error' ? 'var(--danger)' : log.level === 'warn' ? 'var(--warn)' : 'var(--text-secondary)',
                    fontWeight: 600, textTransform: 'uppercase', fontSize: 11,
                  }}>{log.level}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{log.component}</span>
                  <span className="truncate" style={{ color: 'var(--text-primary)' }}>{log.event}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(log.id)}
                      style={{ fontSize: 10, padding: '2px 6px' }} title="删除">✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部统计 */}
        {logs.length > 0 && (
          <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border-color)', fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 16 }}>
            <span>共 {logs.length} 条</span>
            <span>info: {logs.filter(l => l.level === 'info').length}</span>
            <span>warn: {logs.filter(l => l.level === 'warn').length}</span>
            <span>error: {logs.filter(l => l.level === 'error').length}</span>
          </div>
        )}
      </div>

      {/* 详情面板 */}
      {selectedLog && (
        <div style={{
          width: 320, borderLeft: '1px solid var(--border-color)', padding: 16,
          background: 'var(--bg-card)', overflow: 'auto', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>日志详情</h3>
            <button className="btn btn-sm" onClick={() => setSelectedLog(null)} style={{ fontSize: 11, color: 'var(--text-dim)' }}>✕</button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 2, flex: 1 }}>
            <div><span style={{ color: 'var(--text-dim)' }}>ID:</span> {selectedLog.id}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>时间:</span> {selectedLog.timestamp}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>级别:</span> <span style={{
              color: selectedLog.level === 'error' ? 'var(--danger)' : selectedLog.level === 'warn' ? 'var(--warn)' : 'var(--text-primary)',
              fontWeight: 600, textTransform: 'uppercase',
            }}>{selectedLog.level}</span></div>
            <div><span style={{ color: 'var(--text-dim)' }}>组件:</span> {selectedLog.component}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>事件:</span> {selectedLog.event}</div>
            {selectedLog.session_id && <div><span style={{ color: 'var(--text-dim)' }}>会话:</span> <code style={{ fontSize: 11 }}>{selectedLog.session_id}</code></div>}
            {selectedLog.summary && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: 'var(--text-dim)', marginBottom: 4 }}>摘要:</div>
                <div style={{
                  padding: 8, background: 'var(--bg-primary)', borderRadius: 4,
                  fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>{selectedLog.summary}</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
            }}>复制 JSON</button>
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selectedLog.id)}>删除</button>
          </div>
        </div>
      )}
    </div>
  );
}
