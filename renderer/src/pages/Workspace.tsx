import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import ChatBubble, { ChatMessage } from '../components/ChatBubble';

export default function Workspace() {
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sessions, setSessions] = useState<{ id: string; name: string; project_dir: string }[]>([]);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [assistantBuffer, setAssistantBuffer] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const seenMsgIds = useRef(new Set<string>());

  // 加载配置和会话列表
  useEffect(() => {
    api.config.get().then(setConfig).catch(() => {});
    api.session.list().then((s) => setSessions(s as { id: string; name: string; project_dir: string }[])).catch(() => {});
  }, []);

  // 选择会话：加载历史消息，如有运行中的会话先停止再重启
  const handleSelectSession = useCallback(async (sid: string) => {
    // 先停掉当前运行的会话
    if (sessionId && isRunning && sessionId !== sid) {
      await api.cli.stop(sessionId);
    }
    setSessionId(sid);
    seenMsgIds.current.clear();
    const msgs = await api.session.messages.load(sid) as { role: string; content: string; timestamp: number }[];
    setMessages(msgs.map(m => ({ role: m.role as ChatMessage['role'], content: m.content, timestamp: m.timestamp })));
    setAssistantBuffer('');

    // 找到该会话对应的项目目录，重启 CLI
    const session = sessions.find(s => s.id === sid);
    if (session) {
      setProjectDir(session.project_dir);
      const startResult = await api.cli.start(sid, session.project_dir, config);
      if (startResult.ok) {
        setIsRunning(true);
      }
    }
  }, [sessions, config, sessionId, isRunning]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 监听 CLI 输出（带 msgId 去重）
  useEffect(() => {
    return api.cli.onOutput((data) => {
      // 去重：同一 msgId 只处理一次
      if (data.msgId) {
        if (seenMsgIds.current.has(data.msgId)) return;
        seenMsgIds.current.add(data.msgId);
      }

      if (data.role === 'assistant') {
        setAssistantBuffer((prev) => prev + data.text);
      }

      const msg: ChatMessage = {
        role: data.role || (data.type === 'stderr' ? 'system' : 'assistant'),
        content: data.text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev.slice(-500), msg]);

      // 持久化到数据库
      if (sessionId) {
        api.session.messages.save({ sessionId, role: msg.role, content: msg.content, timestamp: msg.timestamp });
      }
    });
  }, [sessionId]);

  // 监听 assistant buffer 完成后追加为单一气泡
  useEffect(() => {
    // buffer 累积完成时，将之前零散的 assistant 消息合并显示
    // 这里依赖 onOutput 已经逐条发送，不需要额外处理
  }, [assistantBuffer]);

  // 监听 CLI 退出
  useEffect(() => {
    return api.cli.onExit((data) => {
      setIsRunning(false);
      setAssistantBuffer('');
      const exitMsg: ChatMessage = {
        role: 'system',
        content: `进程已退出 (code: ${data.code}, signal: ${data.signal})`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, exitMsg]);
    });
  }, []);

  const handleOpenProject = useCallback(async () => {
    const dir = await api.fs.selectDirectory();
    if (dir) setProjectDir(dir);
  }, []);

  const handleStartSession = useCallback(async () => {
    const dir = projectDir || (await api.fs.selectDirectory()) || process.cwd?.() || '~';
    const result = await api.session.create({ projectDir: dir, name: '新会话' }) as { id: string };
    setSessionId(result.id);
    setProjectDir(dir);
    setMessages([]);
    setAssistantBuffer('');

    // 刷新会话列表
    api.session.list().then((s) => setSessions(s as { id: string; name: string; project_dir: string }[])).catch(() => {});

    const startResult = await api.cli.start(result.id, dir, config);
    if (startResult.ok) {
      setIsRunning(true);
      const sysMsg = {
        role: 'system' as const,
        content: `会话已启动 (PID: ${startResult.pid})`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, sysMsg]);
      await api.session.messages.save({ sessionId: result.id, role: sysMsg.role, content: sysMsg.content, timestamp: sysMsg.timestamp });
    } else {
      setMessages((prev) => [...prev, {
        role: 'system' as const,
        content: `启动失败: ${startResult.msg}`,
        timestamp: Date.now(),
      }]);
    }
  }, [projectDir, config]);

  const handleStop = useCallback(async () => {
    if (sessionId) {
      await api.cli.stop(sessionId);
      setIsRunning(false);
      setAssistantBuffer('');
    }
  }, [sessionId]);

  const handleSendInput = useCallback(async () => {
    if (inputText.trim() && sessionId && isRunning) {
      const userMsg: ChatMessage = {
        role: 'user',
        content: inputText.trim(),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      await api.session.messages.save({ sessionId, role: 'user', content: inputText.trim(), timestamp: userMsg.timestamp });
      await api.cli.input(sessionId, inputText);
      setInputText('');
    }
  }, [inputText, sessionId, isRunning]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部工具栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, marginRight: 8 }}>
          {projectDir ? projectDir.split('/').pop() : '纯对话模式'}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={handleOpenProject}>
          📁 选择目录
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleStartSession}
          disabled={isRunning}
        >
          ▶ 新建会话
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            // 如果有选中的会话且未运行，恢复它
            if (sessionId && !isRunning) {
              const session = sessions.find(s => s.id === sessionId);
              if (session) {
                const startResult = await api.cli.start(sessionId, session.project_dir, config);
                if (startResult.ok) setIsRunning(true);
              }
              return;
            }
            // 否则加载最近会话
            const list = await api.session.list().catch(() => []) as { id: string; name: string; project_dir: string }[];
            setSessions(list);
            if (list.length > 0) {
              handleSelectSession(list[0].id);
            }
          }}
          disabled={isRunning}
        >
          ↻ 继续会话
        </button>
        <button
          className="btn btn-danger btn-sm"
          onClick={handleStop}
          disabled={!isRunning}
        >
          ■ 停止运行
        </button>
      </div>

      {/* 主内容区 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 左侧：会话列表 */}
        <div style={{
          width: 200,
          borderRight: '1px solid var(--border-color)',
          padding: 8,
          overflow: 'auto',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, padding: '4px 8px' }}>
            会话历史
          </div>
          {sessions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 8 }}>暂无会话</div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  fontSize: 12,
                  borderRadius: 4,
                  color: s.id === sessionId ? 'var(--cyan)' : 'var(--text-secondary)',
                  background: s.id === sessionId ? 'rgba(0,229,255,0.08)' : 'transparent',
                }}
              >
                <span
                  onClick={() => handleSelectSession(s.id)}
                  style={{ flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {s.name}
                </span>
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    // 先停当前，再重启该会话
                    if (sessionId && isRunning && sessionId !== s.id) {
                      await api.cli.stop(sessionId);
                    }
                    setSessionId(s.id);
                    seenMsgIds.current.clear();
                    const msgs = await api.session.messages.load(s.id) as { role: string; content: string; timestamp: number }[];
                    setMessages(msgs.map(m => ({ role: m.role as ChatMessage['role'], content: m.content, timestamp: m.timestamp })));
                    setAssistantBuffer('');
                    setProjectDir(s.project_dir);
                    const startResult = await api.cli.start(s.id, s.project_dir, config);
                    if (startResult.ok) setIsRunning(true);
                  }}
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    color: 'var(--cyan)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    marginLeft: 4,
                    flexShrink: 0,
                  }}
                  title="继续该会话"
                >
                  ▶
                </button>
              </div>
            ))
          )}
        </div>

        {/* 中间：聊天区 + 输入区 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 消息列表 */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {messages.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 60, fontSize: 14 }}>
                暂无消息，启动会话后开始对话
              </div>
            ) : (
              messages.map((msg, i) => (
                <ChatBubble key={i} message={msg} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入区 */}
          <div style={{
            display: 'flex',
            gap: 8,
            padding: '12px 16px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            flexShrink: 0,
          }}>
            <input
              className="input"
              placeholder={isRunning ? '输入消息...' : '请先启动会话'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendInput(); }}
              disabled={!isRunning}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              onClick={handleSendInput}
              disabled={!isRunning || !inputText.trim()}
            >
              发送
            </button>
          </div>
        </div>

        {/* 右侧：上下文面板 */}
        <div style={{
          width: 220,
          borderLeft: '1px solid var(--border-color)',
          padding: 12,
          overflow: 'auto',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
            上下文信息
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>当前模型</div>
            <div style={{ fontSize: 13 }}>{String(config.model || 'claude-sonnet-4-6')}</div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>项目目录</div>
            <div style={{ fontSize: 11, wordBreak: 'break-all', color: 'var(--text-secondary)' }}>
              {projectDir || '未选择'}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>运行状态</div>
            <div className="flex items-center gap-2">
              <span className={`status-dot ${isRunning ? 'running' : 'idle'}`} />
              <span style={{ fontSize: 13 }}>{isRunning ? '运行中' : '空闲'}</span>
            </div>
          </div>

          <button
            className="btn btn-secondary btn-sm w-full"
            onClick={async () => {
              if (sessionId) {
                api.log.export(`/tmp/session-${sessionId}.log`, 'text');
              }
            }}
          >
            导出日志
          </button>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '4px 16px',
        borderTop: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        fontSize: 11,
        color: 'var(--text-dim)',
        flexShrink: 0,
      }}>
        <span className={`status-dot ${isRunning ? 'running' : 'idle'}`} />
        <span>{isRunning ? '运行中' : '空闲'}</span>
        {projectDir && <span>| {projectDir}</span>}
      </div>
    </div>
  );
}
