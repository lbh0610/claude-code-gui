import { useState, useEffect } from 'react';
import { api } from '../lib/api';

// 系统诊断信息的数据结构定义
interface DiagInfo {
  system: {
    platform: string; arch: string; hostname: string; nodeVersion: string;
    uptime: string; totalMemory: string; freeMemory: string;
    cpuCores: number; cpuModel: string;
  };
  config: {
    configured: boolean; apiKey: string; model: string;
    gatewayUrl: string; proxy: string; systemPrompt: boolean;
    envVars: number; fileExists: boolean;
  };
  db: {
    dbPath: string; dbSize: string; sessions: number;
    messages: number; logs: number; plugins: number; skills: number;
  };
  disk: {
    appDir: string; appDirSize: string; dbSizeBytes: number;
    configSizeBytes: number; logCount: number;
    pluginDir: string; pluginDirExists: boolean;
  };
  cli: {
    status: string; pid: number | null; sessionCount: number;
    cliPath: string; cliExists: boolean;
  };
  timestamp: string; // 诊断数据生成时间
}

// Plugins 页面主组件：系统诊断中心
export default function Plugins() {
  // 诊断数据
  const [diag, setDiag] = useState<DiagInfo | null>(null);
  // 加载状态
  const [loading, setLoading] = useState(true);
  // 操作结果提示消息
  const [actionResult, setActionResult] = useState<string | null>(null);

  // 组件挂载时加载诊断数据
  useEffect(() => { loadDiag(); }, []);

  // 从 API 获取系统诊断信息
  const loadDiag = async () => {
    setLoading(true);
    try {
      const data = await api.diagnostic.get() as DiagInfo;
      setDiag(data);
    } catch { /* 忽略错误，静默处理 */ }
    setLoading(false);
  };

  // 清除日志的处理函数
  const handleClearLogs = async () => {
    try {
      await api.log.clear();
      setActionResult('日志已清除');
      loadDiag();                            // 刷新诊断数据
      setTimeout(() => setActionResult(null), 3000); // 3秒后隐藏提示
    } catch { /* 忽略错误 */ }
  };

  // 测试 API 连接的处理函数
  const handleTestConnection = async () => {
    try {
      const config = await api.config.get() as Record<string, unknown>;
      const result = await api.config.testConnection(config) as { ok: boolean; msg: string };
      setActionResult(result.msg);
      setTimeout(() => setActionResult(null), 5000); // 5秒后隐藏提示
    } catch (e: unknown) {
      setActionResult(e instanceof Error ? e.message : '测试失败');
      setTimeout(() => setActionResult(null), 5000);
    }
  };

  // 加载中状态：居中显示"正在收集诊断信息..."
  if (loading) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>正在收集诊断信息...</div>
      </div>
    );
  }

  // 数据为空时的错误状态
  if (!diag) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div style={{ fontSize: 14, color: 'var(--warn)' }}>诊断信息加载失败</div>
      </div>
    );
  }

  // 主渲染：渲染各诊断卡片
  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--cyan)' }}>
        系统诊断中心
      </h1>

      {/* 操作栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button className="btn btn-secondary btn-sm" onClick={loadDiag}>刷新诊断</button>
        <button className="btn btn-secondary btn-sm" onClick={handleTestConnection}>测试连接</button>
        <button className="btn btn-secondary btn-sm" onClick={handleClearLogs}>清除日志</button>
        {actionResult && (
          <span style={{ fontSize: 12, color: 'var(--success)', alignSelf: 'center' }}>{actionResult}</span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 20 }}>
        {/* 系统信息卡片 */}
        <DiagCard title="系统环境" icon="◈" color="var(--cyan)">
          <DiagRow label="操作系统" value={diag.system.platform} />
          <DiagRow label="架构" value={diag.system.arch} />
          <DiagRow label="主机名" value={diag.system.hostname} />
          <DiagRow label="CPU" value={`${diag.system.cpuModel} (${diag.system.cpuCores} 核)`} />
          <DiagRow label="内存" value={`${diag.system.freeMemory} / ${diag.system.totalMemory}`} />
          <DiagRow label="Node.js" value={`v${diag.system.nodeVersion}`} />
          <DiagRow label="应用运行时间" value={diag.system.uptime} />
        </DiagCard>

        {/* 配置状态卡片 */}
        <DiagCard title="配置状态" icon="⚙" color="var(--purple)">
          <DiagRow label="配置文件" value={diag.config.fileExists ? '已加载' : '不存在'} status={diag.config.fileExists ? 'ok' : 'warn'} />
          <DiagRow label="API Key" value={diag.config.apiKey} status={diag.config.configured ? 'ok' : 'error'} />
          <DiagRow label="模型" value={diag.config.model} />
          <DiagRow label="网关" value={diag.config.gatewayUrl} />
          <DiagRow label="代理" value={diag.config.proxy} />
          <DiagRow label="系统提示词" value={diag.config.systemPrompt ? '已配置' : '未配置'} />
          <DiagRow label="自定义环境变量" value={`${diag.config.envVars} 项`} />
        </DiagCard>

        {/* 数据库统计卡片 */}
        <DiagCard title="数据库" icon="▦" color="var(--success)">
          <DiagRow label="数据库大小" value={diag.db.dbSize} />
          <DiagRow label="路径" value={diag.db.dbPath} mono />
          <DiagRow label="会话数" value={diag.db.sessions} />
          <DiagRow label="消息数" value={diag.db.messages} />
          <DiagRow label="日志条目" value={diag.db.logs} />
          <DiagRow label="Skills" value={diag.db.skills} />
        </DiagCard>

        {/* CLI 引擎状态卡片 */}
        <DiagCard title="CLI 引擎" icon="⚡" color="var(--warn)">
          <DiagRow
            label="状态"
            value={diag.cli.status === 'running' ? '运行中' : diag.cli.status === 'idle' ? '空闲' : '错误'}
            status={diag.cli.status === 'running' ? 'ok' : diag.cli.status === 'idle' ? 'warn' : 'error'}
          />
          {diag.cli.pid && <DiagRow label="进程 ID" value={String(diag.cli.pid)} mono />}
          <DiagRow label="活跃会话" value={String(diag.cli.sessionCount)} />
          <DiagRow
            label="CLI 路径"
            value={diag.cli.cliExists ? diag.cli.cliPath : '未找到'}
            status={diag.cli.cliExists ? 'ok' : 'error'}
            mono
          />
        </DiagCard>

        {/* 存储用量卡片 */}
        <DiagCard title="存储用量" icon="▤" color="var(--text-secondary)">
          <DiagRow label="数据目录" value={diag.disk.appDir} mono />
          <DiagRow label="目录总大小" value={diag.disk.appDirSize} />
          <DiagRow label="数据库" value={formatBytes(diag.disk.dbSizeBytes)} />
          <DiagRow label="配置文件" value={formatBytes(diag.disk.configSizeBytes)} />
          <DiagRow label="插件目录" value={diag.disk.pluginDirExists ? '存在' : '不存在'} />
        </DiagCard>
      </div>
    </div>
  );
}

// 字节数格式化函数：将字节转换为人类可读的单位（B/KB/MB/GB）
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// DiagCard 子组件：诊断信息卡片容器，带标题、图标和主题色
function DiagCard({ title, icon, color, children }: {
  title: string; icon: string; color: string; children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 16, color }}>{icon}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

// DiagRow 子组件：诊断信息的单行键值对，支持状态颜色（ok/warn/error）和等宽字体选项
function DiagRow({ label, value, status, mono }: {
  label: string; value: string | number; status?: 'ok' | 'warn' | 'error'; mono?: boolean;
}) {
  // 根据状态值映射到对应的 CSS 变量颜色
  const statusColor = status === 'ok' ? 'var(--success)' : status === 'warn' ? 'var(--warn)' : status === 'error' ? 'var(--danger)' : undefined;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)', minWidth: 120 }}>{label}</span>
      <span style={{
        fontSize: 12, color: statusColor || 'var(--text-secondary)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        maxWidth: 400, textAlign: 'right',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
    </div>
  );
}
