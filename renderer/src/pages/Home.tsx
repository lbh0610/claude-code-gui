import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import StatusCard from '../components/StatusCard';

interface RecentSession {
  id: string;
  name: string;
  project_dir: string;
  status: string;
  created_at: string;
  msgCount: number;
}

export default function Home() {
  const navigate = useNavigate();
  const [cliStatus, setCliStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [cliPid, setCliPid] = useState<number | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [todayStats, setTodayStats] = useState({ count: 0, tokens: 0, cost: 0 });
  const [showCmdK, setShowCmdK] = useState(false);
  const [cmdInput, setCmdInput] = useState('');
  const [allSessions, setAllSessions] = useState<{ id: string; name: string }[]>([]);

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

  useEffect(() => {
    loadRecent();
    loadTodayStats();
    loadAllSessions();
  }, []);

  const loadRecent = async () => {
    try {
      const sessions = await api.session.list() as { id: string; name: string; project_dir: string; status: string; created_at: string }[];
      const recent = sessions.slice(0, 5);
      const withCount: RecentSession[] = [];
      for (const s of recent) {
        const msgs = await api.session.messages.load(s.id) as unknown[];
        withCount.push({ ...s, msgCount: msgs?.length || 0 });
      }
      setRecentSessions(withCount);
    } catch { /* ignore */ }
  };

  const loadTodayStats = async () => {
    try {
      const sessions = await api.session.list() as { id: string }[];
      const today = new Date().toDateString();
      let count = 0, tokens = 0, cost = 0;
      for (const s of sessions) {
        const msgs = await api.session.messages.load(s.id) as { role: string; timestamp: number; input_tokens?: number; output_tokens?: number; cost?: number }[];
        const todayMsgs = (msgs || []).filter(m => new Date(m.timestamp).toDateString() === today && m.role !== 'system');
        for (const m of todayMsgs) {
          if (m.role === 'assistant') count++;
          tokens += (m.input_tokens || 0) + (m.output_tokens || 0);
          cost += m.cost || 0;
        }
      }
      setTodayStats({ count, tokens, cost });
    } catch { /* ignore */ }
  };

  const loadAllSessions = async () => {
    try {
      const sessions = await api.session.list() as { id: string; name: string }[];
      setAllSessions(sessions);
    } catch { /* ignore */ }
  };

  const handleSelectSession = useCallback(async (sid: string) => {
    navigate('/workspace', { state: { sessionId: sid } });
  }, [navigate]);

  const filteredSessions = cmdInput
    ? allSessions.filter(s => s.name.toLowerCase().includes(cmdInput.toLowerCase()))
    : [];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCmdK(true);
      }
      if (e.key === 'Escape' && showCmdK) {
        setShowCmdK(false);
        setCmdInput('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showCmdK]);

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      {/* 欢迎标题 */}
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--cyan)', marginBottom: 8 }}>
            Agent Workbench
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            按 <kbd style={{ padding: '1px 6px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 12 }}>⌘K</kbd> 快速跳转
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowCmdK(true)}>⌘K 快速跳转</button>
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
          detail="未配置"
          icon="⇢"
        />
        <StatusCard
          label="版本"
          status="idle"
          detail="v0.1.0"
          icon="↻"
        />
      </div>

      {/* 今日统计 */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
        今日使用
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--cyan)' }}>{todayStats.count}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>AI 回复次数</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--purple)' }}>
            {todayStats.tokens >= 1000 ? `${(todayStats.tokens / 1000).toFixed(1)}k` : todayStats.tokens}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Token 用量</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>
            ${todayStats.cost.toFixed(4)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>今日费用</div>
        </div>
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
          icon="📋"
          title="日志诊断"
          desc="查看系统日志和诊断报告"
          onClick={() => navigate('/logs')}
        />
        <QuickAction
          icon="★"
          title="Skills"
          desc="管理 Claude Code Skills"
          onClick={() => navigate('/skills')}
        />
      </div>

      {/* 最近会话 */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
        最近会话
      </h2>
      {recentSessions.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
          暂无会话，点击上方"新建会话"开始
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recentSessions.map((s) => (
            <div key={s.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => handleSelectSession(s.id)}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {s.project_dir.split('/').pop()} · {s.msgCount} 条消息
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {new Date(s.created_at).toLocaleString('zh-CN')}
                </span>
                <span className={`status-dot ${s.status === 'running' ? 'running' : 'idle'}`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cmd+K 快速跳转 Modal */}
      {showCmdK && (
        <div onClick={() => { setShowCmdK(false); setCmdInput(''); }} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 120,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: 0, maxWidth: 500, width: '90%',
            border: '1px solid var(--border-color)', overflow: 'hidden',
          }}>
            <input
              className="input"
              placeholder="搜索会话..."
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              autoFocus
              style={{ padding: '14px 16px', fontSize: 14, border: 'none', borderBottom: '1px solid var(--border-color)', borderRadius: 0 }}
            />
            <div style={{ maxHeight: 300, overflow: 'auto', padding: 8 }}>
              {filteredSessions.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                  {cmdInput ? '无匹配结果' : '输入关键词搜索会话'}
                </div>
              ) : (
                filteredSessions.map((s) => (
                  <div key={s.id} onClick={() => { handleSelectSession(s.id); setShowCmdK(false); setCmdInput(''); }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', borderRadius: 6,
                      fontSize: 13, color: 'var(--text-primary)',
                    }}>
                    {s.name}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAction({ icon, title, desc, onClick }: {
  icon: string; title: string; desc: string; onClick: () => void;
}) {
  return (
    <div className="card" style={{ flex: 1, cursor: 'pointer', textAlign: 'center', padding: 20 }} onClick={onClick}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{desc}</div>
    </div>
  );
}
