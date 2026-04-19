// 内嵌终端组件 - 显示 CLI 实时输出
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';

interface TerminalLine {
  id: number;
  type: 'stdout' | 'stderr' | 'system';
  text: string;
  timestamp: number;
}

interface EmbeddedTerminalProps {
  sessionId: string | null;
  visible: boolean;
  height?: number;
  onHeightChange?: (h: number) => void;
}

let lineId = 0;

export default function EmbeddedTerminal({ sessionId, visible, height = 160, onHeightChange }: EmbeddedTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [cleared, setCleared] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ y: number; h: number } | null>(null);

  // 监听 CLI 输出，追加到终端
  useEffect(() => {
    if (!sessionId) return;
    setCleared(false);
    setLines([]);
  }, [sessionId]);

  useEffect(() => {
    return api.cli.onOutput((data) => {
      if (!sessionId) return;
      setLines(prev => [...prev.slice(-500), {
        id: lineId++,
        type: data.type === 'stderr' ? 'stderr' : 'stdout',
        text: data.text,
        timestamp: Date.now(),
      }]);
    });
  }, [sessionId]);

  // 自动滚动到底部
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  // 拖拽调整高度
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = { y: e.clientY, h: height };
    const onMove = (ev: MouseEvent) => {
      if (!dragStartRef.current) return;
      const diff = dragStartRef.current.y - ev.clientY;
      const newHeight = Math.max(80, Math.min(500, dragStartRef.current.h + diff));
      onHeightChange?.(newHeight);
    };
    const onUp = () => {
      dragStartRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [height, onHeightChange]);

  if (!visible) return null;

  if (collapsed) {
    return (
      <div style={{
        borderTop: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 12px', background: 'var(--bg-card)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>终端 ({lines.length} 行)</span>
        <button className="btn btn-sm" onClick={() => setCollapsed(false)} style={{ fontSize: 10, padding: '2px 6px', color: 'var(--cyan)' }}>展开 ▸</button>
      </div>
    );
  }

  return (
    <div style={{ flexShrink: 0 }}>
      {/* 拖拽条 */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          height: 4, cursor: 'row-resize', background: 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cyan)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      />
      <div style={{ height, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-color)' }}>
        {/* 终端头部 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 12px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>终端</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{lines.length} 行</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-sm" onClick={() => setCleared(true) || setLines([])} style={{ fontSize: 10, padding: '2px 6px', color: 'var(--text-dim)' }}>清除</button>
            <button className="btn btn-sm" onClick={() => setCollapsed(true)} style={{ fontSize: 10, padding: '2px 6px', color: 'var(--text-dim)' }}>折叠 ◂</button>
          </div>
        </div>
        {/* 终端内容 */}
        <div ref={terminalRef} style={{
          flex: 1, overflow: 'auto', background: '#0d0d0d',
          fontFamily: 'var(--font-mono, monospace)', fontSize: 12, lineHeight: 1.5,
          padding: '8px 12px',
        }}>
          {lines.length === 0 ? (
            <div style={{ color: '#666' }}>等待输出...</div>
          ) : (
            lines.map((line) => (
              <div key={line.id} style={{
                color: line.type === 'stderr' ? '#f87171' : '#e5e5e5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                userSelect: 'text',
              }}>
                {line.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
