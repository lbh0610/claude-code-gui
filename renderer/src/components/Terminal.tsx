import { useRef, useEffect, useState } from 'react';

interface TerminalProps {
  lines: { type: 'stdout' | 'stderr' | 'info'; text: string }[];
  isRunning?: boolean;
}

export default function Terminal({ lines, isRunning }: TerminalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines]);

  const handleCopy = () => {
    const text = lines.map((l) => l.text).join('');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: '#0C1220',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border-color)',
      overflow: 'hidden',
    }}>
      {/* Terminal header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="status-dot running" style={{ animation: 'pulse 1.5s infinite' }} />
          )}
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            CLI Output
          </span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>

      {/* Terminal body */}
      <div
        ref={ref}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 12,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {lines.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 40 }}>
            {isRunning ? '等待输出...' : '暂无输出，启动会话后将在此显示'}
          </div>
        ) : (
          lines.map((line, i) => (
            <span
              key={i}
              style={{
                color: line.type === 'stderr' ? 'var(--danger)' :
                       line.type === 'info' ? 'var(--cyan)' :
                       'var(--text-primary)',
              }}
            >
              {line.text}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
