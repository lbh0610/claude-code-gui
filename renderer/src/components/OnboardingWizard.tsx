// 首次启动引导向导
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface OnboardingStep {
  title: string;
  description: string;
  icon: string;
}

const STEPS: OnboardingStep[] = [
  { title: '欢迎使用', description: 'Agent Workbench 是一个可视化的 AI 代理工作台，帮助你更高效地管理 CLI 会话和项目。', icon: '👋' },
  { title: '检测 CLI', description: '工作台依赖 Claude CLI。我们将自动检测是否已安装。', icon: '⚡' },
  { title: '导入配置', description: '如果你已安装 Claude CLI，可以自动导入 API Key 和模型配置。', icon: '📋' },
];

export default function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [cliDetected, setCliDetected] = useState<boolean | null>(null);
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState('');
  const [configImported, setConfigImported] = useState(false);
  const [importing, setImporting] = useState(false);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  // 挂载时立即检测 CLI
  useEffect(() => {
    setChecking(true);
    api.cli.detect().then((r: { found: boolean; path: string | null }) => {
      setCliDetected(r.found);
      setCliPath(r.path);
    }).catch(() => setCliDetected(false)).finally(() => setChecking(false));
  }, []);

  // 安装 CLI
  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setInstallMsg('正在安装...');
    const unsub = api.cli.onInstallProgress((msg: string) => setInstallMsg(msg));
    try {
      const r = await api.cli.install(false);
      if (r.ok) {
        setCliDetected(true);
        setCliPath(r.path || null);
      }
    } catch { /* 忽略 */ } finally {
      setInstalling(false);
      unsub();
    }
  }, []);

  // 从 Claude CLI 导入配置
  const handleImportConfig = useCallback(async () => {
    setImporting(true);
    try {
      const r = await api.config.importFromClaude();
      if (r.ok) setConfigImported(true);
    } catch { /* 忽略 */ } finally {
      setImporting(false);
    }
  }, []);

  const next = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(currentStep + 1);
    else onComplete();
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 0,
        maxWidth: 480, width: '90%', border: '1px solid var(--border-color)',
        overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* 进度条 */}
        <div style={{ height: 3, background: 'var(--border-color)' }}>
          <div style={{
            height: '100%', width: `${((currentStep + 1) / STEPS.length) * 100}%`,
            background: 'var(--cyan)', transition: 'width 0.3s ease',
          }} />
        </div>

        <div style={{ padding: 32 }}>
          {/* 步骤指示器 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: i <= currentStep ? 'var(--cyan)' : 'var(--border-color)',
                transition: 'background 0.2s',
              }} />
            ))}
          </div>

          {/* 内容 */}
          <div style={{ fontSize: 40, marginBottom: 16 }}>{STEPS[currentStep].icon}</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
            {STEPS[currentStep].title}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
            {STEPS[currentStep].description}
          </p>

          {/* 步骤 1：CLI 检测 */}
          {currentStep === 1 && (
            <div style={{
              padding: 16, borderRadius: 10, marginBottom: 16,
              background: cliDetected === true ? 'rgba(0,230,118,0.08)' : cliDetected === false ? 'rgba(239,68,68,0.08)' : 'rgba(158,167,192,0.08)',
              border: `1px solid ${cliDetected === true ? 'rgba(0,230,118,0.3)' : cliDetected === false ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}`,
            }}>
              {checking ? (
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>正在检测...</div>
              ) : cliDetected ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>CLI 已安装</div>
                  {cliPath && <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{cliPath}</div>}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)' }}>未检测到 CLI</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>需要安装 Claude CLI 才能使用 AI 功能</div>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={handleInstall} disabled={installing}>
                    {installing ? '安装中...' : '一键安装 CLI'}
                  </button>
                  {installing && installMsg && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>{installMsg}</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 步骤 2：导入配置 */}
          {currentStep === 2 && (
            <div style={{
              padding: 16, borderRadius: 10, marginBottom: 16,
              background: configImported ? 'rgba(0,230,118,0.08)' : 'rgba(158,167,192,0.08)',
              border: `1px solid ${configImported ? 'rgba(0,230,118,0.3)' : 'var(--border-color)'}`,
            }}>
              {configImported ? (
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>配置已导入</div>
              ) : cliDetected ? (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    检测到 Claude CLI，可从 ~/.claude/settings.json 导入配置
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleImportConfig} disabled={importing}>
                    {importing ? '导入中...' : '导入配置'}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  安装 CLI 后可自动导入配置，也可稍后在设置页手动配置
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 32px', borderTop: '1px solid var(--border-color)',
        }}>
          <button className="btn btn-secondary btn-sm" onClick={onComplete}>
            跳过引导
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {currentStep > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={prev}>
                上一步
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={next}>
              {currentStep === STEPS.length - 1 ? '开始使用' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
