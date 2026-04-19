import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

// 日志条目的数据结构定义
interface LogEntry {
  id: number;            // 日志唯一ID
  timestamp: string;     // 时间戳
  component: string | null; // 所属组件名（可为空）
  level: string;         // 日志级别（info/warn/error）
  event: string | null;  // 事件名称（可为空）
  summary: string | null; // 摘要内容（可为空）
  session_id: string | null; // 关联的会话ID（可为空）
  content: string | null;    // 输入/输出文本内容
}

// Logs 页面主组件：日志查看与管理
export default function Logs() {
  const navigate = useNavigate();
  // 日志列表数据
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // 会话名称缓存：session_id -> name
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  // 日志级别筛选条件
  const [filterLevel, setFilterLevel] = useState('');
  // 组件筛选条件
  const [filterComponent, setFilterComponent] = useState('');
  // 按会话过滤
  const [filterSession, setFilterSession] = useState('');
  // 搜索关键词
  const [search, setSearch] = useState('');
  // 当前选中的单条日志（用于详情面板）
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  // 批量选中的日志ID集合
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 当级别或组件或会话筛选条件变化时，重新加载日志
  useEffect(() => { loadLogs(); }, [filterLevel, filterComponent, filterSession]);

  // 从 API 加载日志列表
  const loadLogs = async () => {
    const data = await api.log.list({
      level: filterLevel || undefined,       // 空值转为 undefined 以跳过该筛选
      component: filterComponent || undefined,
      sessionId: filterSession || undefined,
      search: search.trim() || undefined,    // 去除首尾空格
      limit: 500,                            // 最多返回500条
    });
    setLogs(data as LogEntry[]);
    setSelectedIds(new Set());               // 重置选中状态

    // 提取日志中涉及的 session_id，批量获取名称
    const sessionIds = [...new Set((data as LogEntry[]).map(l => l.session_id).filter(Boolean))];
    if (sessionIds.length > 0) {
      const sessions = await api.session.list();
      const nameMap: Record<string, string> = {};
      for (const s of sessions as { id: string; name: string }[]) {
        nameMap[s.id] = s.name;
      }
      setSessionNames(prev => ({ ...prev, ...nameMap }));
    }
  };

  // 删除单条日志的处理函数
  const handleDelete = async (id: number) => {
    await api.log.delete(id);
    if (selectedLog?.id === id) setSelectedLog(null); // 如果删除的是当前查看的日志，关闭详情面板
    await loadLogs();                       // 重新加载列表
  };

  // 清空全部日志的处理函数
  const handleClear = async () => {
    if (!confirm('确定清空全部日志？此操作不可恢复。')) return;
    await api.log.clear();
    setLogs([]);                            // 清空本地状态
    setSelectedLog(null);                   // 关闭详情面板
    setSelectedIds(new Set());              // 重置选中状态
  };

  // 批量删除选中日志的处理函数
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;     // 没有选中项时直接返回
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条日志？`)) return;
    for (const id of selectedIds) await api.log.delete(id); // 逐条删除
    setSelectedIds(new Set());              // 重置选中状态
    setSelectedLog(null);                   // 关闭详情面板
    await loadLogs();                       // 重新加载列表
  };

  // 切换单条日志的选中状态
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id); // 已选中则取消，未选中则添加
      return next;
    });
  };

  // 全选/取消全选当前列表中的所有日志
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === logs.length ? new Set() : new Set(logs.map(l => l.id)));
  };

  // 从日志列表中提取所有不重复的组件名，用于筛选下拉框
  const components = useMemo(() => [...new Set(logs.map(l => l.component).filter(Boolean))], [logs]);

  // 打开关联的会话
  const handleOpenSession = useCallback((sid: string) => {
    const s = sessionNames[sid];
    navigate('/workspace', { state: { sessionId: sid } });
  }, [navigate, sessionNames]);

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
          {logs.some(l => l.session_id) && (
            <select className="select" value={filterSession} onChange={(e) => setFilterSession(e.target.value)} style={{ fontSize: 12, maxWidth: 200 }}>
              <option value="">全部会话</option>
              {[...new Set(logs.filter(l => l.session_id).map(l => l.session_id!))].map(sid => (
                <option key={sid} value={sid}>{sessionNames[sid] || sid.slice(0, 20)}</option>
              ))}
            </select>
          )}
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
                display: 'grid', gridTemplateColumns: '32px 150px 72px 90px 1fr 90px', gap: 8,
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
                    display: 'grid', gridTemplateColumns: '32px 150px 72px 90px 1fr 90px', gap: 8,
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
                  <span className="truncate" style={{ color: 'var(--text-primary)' }}>
                    {log.event}
                    {log.session_id && (
                      <span style={{
                        marginLeft: 6, fontSize: 10, color: 'var(--cyan)', cursor: 'pointer',
                        textDecoration: 'underline',
                      }} onClick={(e) => { e.stopPropagation(); handleOpenSession(log.session_id!); }}>
                        → 打开会话
                      </span>
                    )}
                  </span>
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
            {selectedLog.session_id && (
              <div>
                <span style={{ color: 'var(--text-dim)' }}>会话:</span>{' '}
                <code style={{ fontSize: 11, cursor: 'pointer', color: 'var(--cyan)' }}
                  onClick={() => handleOpenSession(selectedLog.session_id!)}
                  title="点击打开会话">
                  {sessionNames[selectedLog.session_id] || selectedLog.session_id.slice(0, 20)}
                </code>
              </div>
            )}
            {selectedLog.summary && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: 'var(--text-dim)', marginBottom: 4 }}>摘要:</div>
                <div style={{
                  padding: 8, background: 'var(--bg-primary)', borderRadius: 4,
                  fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>{selectedLog.summary}</div>
              </div>
            )}
            {selectedLog.content && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: 'var(--text-dim)', marginBottom: 4 }}>内容:</div>
                <div style={{
                  padding: 8, background: 'var(--bg-primary)', borderRadius: 4,
                  fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  maxHeight: 300, overflow: 'auto', fontFamily: 'var(--font-mono)',
                }}>{selectedLog.content}</div>
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
