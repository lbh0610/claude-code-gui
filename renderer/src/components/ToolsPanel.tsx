// 工具使用统计 / MCP 可视化面板
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface ToolStat {
  tool_name: string;
  totalCalls: number;
  totalSuccess: number;
  sessions: number;
  lastCalled: string;
}

export default function ToolsPanel() {
  const [stats, setStats] = useState<ToolStat[]>([]);
  const [activeTab, setActiveTab] = useState<'tools' | 'mcp'>('tools');

  useEffect(() => {
    api.tool.list().then(s => setStats(s as ToolStat[])).catch(() => {});
  }, []);

  // 已知工具分类
  const MCP_TOOLS = stats.filter(t => t.tool_name.toLowerCase().includes('mcp') || t.tool_name.includes('/'));
  const BUILTIN_TOOLS = stats.filter(t => !MCP_TOOLS.includes(t));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 头部标签 */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <button
          onClick={() => setActiveTab('tools')}
          style={{
            flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: activeTab === 'tools' ? 'rgba(0,229,255,0.08)' : 'transparent',
            color: activeTab === 'tools' ? 'var(--cyan)' : 'var(--text-dim)',
            border: 'none', borderBottom: activeTab === 'tools' ? '2px solid var(--cyan)' : '2px solid transparent',
          }}
        >
          内置工具
        </button>
        <button
          onClick={() => setActiveTab('mcp')}
          style={{
            flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: activeTab === 'mcp' ? 'rgba(0,229,255,0.08)' : 'transparent',
            color: activeTab === 'mcp' ? 'var(--cyan)' : 'var(--text-dim)',
            border: 'none', borderBottom: activeTab === 'mcp' ? '2px solid var(--cyan)' : '2px solid transparent',
          }}
        >
          MCP Server
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {activeTab === 'tools' ? (
          BUILTIN_TOOLS.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              暂无工具使用记录
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {BUILTIN_TOOLS.map((t, i) => (
                <ToolCard key={i} tool={t} />
              ))}
            </div>
          )
        ) : (
          MCP_TOOLS.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              暂无 MCP Server 连接
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MCP_TOOLS.map((t, i) => (
                <ToolCard key={i} tool={t} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolStat }) {
  const successRate = tool.totalCalls > 0 ? Math.round((tool.totalSuccess / tool.totalCalls) * 100) : 0;
  const rateColor = successRate >= 90 ? 'var(--success)' : successRate >= 70 ? 'var(--warning, #f59e0b)' : 'var(--danger)';

  return (
    <div style={{
      padding: 10, borderRadius: 6,
      border: '1px solid var(--border-color)',
      background: 'var(--bg-card)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{tool.tool_name}</span>
        <span style={{ fontSize: 11, color: rateColor, fontWeight: 600 }}>{successRate}%</span>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-dim)' }}>
        <span>调用: {tool.totalCalls}</span>
        <span>成功: {tool.totalSuccess}</span>
        <span>会话: {tool.sessions}</span>
      </div>
      {/* 进度条 */}
      <div style={{ height: 3, borderRadius: 2, background: 'var(--border-color)', marginTop: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${successRate}%`, background: rateColor, borderRadius: 2 }} />
      </div>
    </div>
  );
}
