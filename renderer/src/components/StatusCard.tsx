interface StatusCardProps {
  label: string;
  status: 'running' | 'online' | 'idle' | 'error' | 'offline';
  detail?: string;
  icon?: string;
}

const STATUS_MAP = {
  running: { color: 'var(--success)', text: '运行中' },
  online: { color: 'var(--success)', text: '在线' },
  idle: { color: 'var(--warn)', text: '空闲' },
  error: { color: 'var(--danger)', text: '异常' },
  offline: { color: 'var(--text-dim)', text: '离线' },
};

export default function StatusCard({ label, status, detail, icon }: StatusCardProps) {
  const s = STATUS_MAP[status];

  return (
    <div className="card" style={{ flex: 1, minWidth: 180 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`status-dot ${status}`} />
        <span style={{ fontSize: 14, fontWeight: 600, color: s.color }}>{s.text}</span>
      </div>
      {detail && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{detail}</div>
      )}
    </div>
  );
}
