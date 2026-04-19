import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import StatusCard from '../components/StatusCard';

export default function Home() {
  const navigate = useNavigate();
  const [cliStatus, setCliStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [cliPid, setCliPid] = useState<number | null>(null);

  useEffect(() => {
    api.cli.status().then((s: { status: string; pid: number | null; sessionCount: number }) => {
      setCliStatus(s.status === 'running' ? 'running' : 'idle');
      setCliPid(s.pid);
    }).catch(() => {});

    const unsub = api.cli.onStatus((data: { status: string; pid: number | null }) => {
      setCliStatus(data.status === 'running' ? 'running' : data.status === 'error' ? 'error' : 'idle');
      setCliPid(data.pid);
    });
    return unsub;
  }, []);

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      {/* 欢迎标题 */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--cyan)', marginBottom: 8 }}>
          欢迎使用 Agent Workbench
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          可视化的 AI 编程助手桌面客户端
        </p>
      </div>

      {/* 状态卡片 */}
      <div className="flex gap-4" style={{ marginBottom: 32 }}>
        <StatusCard
          label="CLI 状态"
          status={cliStatus}
          detail={cliPid ? `PID: ${cliPid}` : '未启动'}
          icon="⚡"
        />
        <StatusCard
          label="API / 网关"
          status="idle"
          detail="配置后自动检测"
          icon="◈"
        />
        <StatusCard
          label="代理"
          status="offline"
          detail="未配置代理"
          icon="⇢"
        />
        <StatusCard
          label="更新"
          status="idle"
          detail="v0.1.0"
          icon="↻"
        />
      </div>

      {/* 快捷入口 */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
        快捷操作
      </h2>
      <div className="flex gap-4" style={{ marginBottom: 32 }}>
        <QuickAction
          icon="📁"
          title="打开项目"
          desc="选择本地项目目录"
          onClick={async () => {
            const dir = await api.fs.selectDirectory();
            if (dir) navigate('/workspace', { state: { projectDir: dir } });
          }}
        />
        <QuickAction
          icon="💬"
          title="新建会话"
          desc="开始新的 AI 对话"
          onClick={() => navigate('/workspace')}
        />
        <QuickAction
          icon="📦"
          title="导入离线补丁"
          desc="导入离线更新包"
          onClick={() => navigate('/updates')}
        />
        <QuickAction
          icon="🔍"
          title="查看诊断"
          desc="生成诊断报告"
          onClick={() => navigate('/logs')}
        />
      </div>

      {/* 最近项目 */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
        最近访问
      </h2>
      <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
        暂无最近访问的项目，点击上方"打开项目"开始
      </div>
    </div>
  );
}

function QuickAction({ icon, title, desc, onClick }: {
  icon: string; title: string; desc: string; onClick: () => void;
}) {
  return (
    <div
      className="card"
      style={{
        flex: 1,
        cursor: 'pointer',
        textAlign: 'center',
        padding: 20,
      }}
      onClick={onClick}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{desc}</div>
    </div>
  );
}
