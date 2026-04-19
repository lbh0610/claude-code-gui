import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface LogEntry {
  id: number;
  timestamp: string;
  component: string | null;
  level: string;
  event: string | null;
  summary: string | null;
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState('');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    const data = await api.log.list({
      level: filterLevel || undefined,
      limit: 100,
    });
    setLogs(data as LogEntry[]);
  };

  const handleExport = async () => {
    const path = `/tmp/agent-workbench-logs-${Date.now()}.json`;
    await api.log.export(path, 'json');
    alert(`日志已导出: ${path}`);
  };

  const handleDiagnostic = async () => {
    const path = `/tmp/agent-workbench-diag-${Date.now()}.json`;
    await api.log.diagnostic(path);
    alert(`诊断包已生成: ${path}`);
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 主区域 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 筛选区 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <select
            className="select"
            value={filterLevel}
            onChange={(e) => { setFilterLevel(e.target.value); }}
          >
            <option value="">全部级别</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={loadLogs}>刷新</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>导出日志</button>
          <button className="btn btn-secondary btn-sm" onClick={handleDiagnostic}>生成诊断包</button>
        </div>

        {/* 日志列表 */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
              暂无日志记录
            </div>
          ) : (
            <div style={{ fontSize: 12 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '160px 80px 100px 1fr',
                gap: 8,
                padding: '8px 16px',
                borderBottom: '1px solid var(--border-color)',
                color: 'var(--text-dim)',
                fontWeight: 600,
              }}>
                <span>时间</span>
                <span>级别</span>
                <span>组件</span>
                <span>事件</span>
              </div>
              {logs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 80px 100px 1fr',
                    gap: 8,
                    padding: '8px 16px',
                    borderBottom: '1px solid rgba(34,58,96,0.3)',
                    cursor: 'pointer',
                    background: selectedLog?.id === log.id ? 'rgba(0,229,255,0.05)' : 'transparent',
                  }}
                  onClick={() => setSelectedLog(log)}
                >
                  <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {log.timestamp}
                  </span>
                  <span style={{
                    color: log.level === 'error' ? 'var(--danger)' :
                           log.level === 'warn' ? 'var(--warn)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}>
                    {log.level}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{log.component}</span>
                  <span className="truncate" style={{ color: 'var(--text-primary)' }}>{log.event}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 详情面板 */}
      {selectedLog && (
        <div style={{
          width: 300,
          borderLeft: '1px solid var(--border-color)',
          padding: 16,
          background: 'var(--bg-card)',
          overflow: 'auto',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>日志详情</h3>
          <div style={{ fontSize: 12, lineHeight: 2 }}>
            <div><span style={{ color: 'var(--text-dim)' }}>时间:</span> {selectedLog.timestamp}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>级别:</span> {selectedLog.level}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>组件:</span> {selectedLog.component}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>事件:</span> {selectedLog.event}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>摘要:</span> {selectedLog.summary}</div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 16 }}
            onClick={() => {
              const text = JSON.stringify(selectedLog, null, 2);
              navigator.clipboard.writeText(text);
            }}
          >
            复制详情
          </button>
        </div>
      )}
    </div>
  );
}
