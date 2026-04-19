import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '../lib/api';
import ChatBubble, { ChatMessage } from '../components/ChatBubble';
import ErrorBoundary from '../components/ErrorBoundary';

export default function Workspace({ theme, onThemeChange }: { theme?: string; onThemeChange?: (t: string) => void }) {
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sessions, setSessions] = useState<{ id: string; name: string; project_dir: string }[]>([]);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [searchText, setSearchText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const seenMsgIds = useRef(new Set<string>());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isFirstUserMsg = useRef(true);

  // 任务执行流
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [taskEvents, setTaskEvents] = useState<{ type: string; subtype: string; summary: string; raw: string; timestamp: number }[]>([]);

  // 流式消息
  const [streamingMsg, setStreamingMsg] = useState<ChatMessage | null>(null);

  // 会话内消息搜索
  const [msgSearch, setMsgSearch] = useState('');

  // 快捷键面板
  const [showShortcuts, setShowShortcuts] = useState(false);

  // 加载配置和会话列表，自动恢复上次会话
  useEffect(() => {
    api.config.get().then(cfg => {
      setConfig(cfg);
      // 恢复主题
      if (cfg.theme && typeof cfg.theme === 'string') {
        onThemeChange?.(cfg.theme);
      }
    }).catch(() => {});
    api.session.list().then((s) => {
      setSessions(s as { id: string; name: string; project_dir: string }[]);
      // 自动选择最近的会话（列表第一个）
      if (s.length > 0) {
        handleSelectSession(s[0].id);
      }
    }).catch(() => {});
  }, []);

  // 选择会话
  const handleSelectSession = useCallback(async (sid: string) => {
    try {
      if (sessionId && isRunning && sessionId !== sid) {
        await api.cli.stop(sessionId);
      }
      setSessionId(sid);
      seenMsgIds.current.clear();
      taskMsgIdsRef.current.clear();
      setMsgSearch('');

      const msgs = await api.session.messages.load(sid) as { role: string; content: string; thinking: string | null; tool_steps: string | null; cost: number | null; duration: number | null; input_tokens: number | null; output_tokens: number | null; cache_creation_tokens: number | null; cache_read_tokens: number | null; timestamp: number }[];
      const parsedMsgs = (msgs || []).map(m => {
        let parsedSteps: unknown[] | undefined;
        if (m?.tool_steps) {
          try { parsedSteps = JSON.parse(m.tool_steps); } catch { /* ignore */ }
        }
        return {
          role: (m?.role || 'system') as ChatMessage['role'],
          content: m?.content || '',
          thinking: m?.thinking || undefined,
          toolSteps: parsedSteps,
          cost: m?.cost ?? undefined,
          duration: m?.duration ?? undefined,
          inputTokens: m?.input_tokens ?? undefined,
          outputTokens: m?.output_tokens ?? undefined,
          cacheCreationTokens: m?.cache_creation_tokens ?? undefined,
          cacheReadTokens: m?.cache_read_tokens ?? undefined,
          timestamp: m?.timestamp || Date.now(),
        };
      });
      setMessages(parsedMsgs);
      // 如果已有用户消息，说明不是第一次对话
      isFirstUserMsg.current = !parsedMsgs.some(m => m.role === 'user');
      setStreamingMsg(null);

      const session = sessions.find(s => s.id === sid);
      if (session) {
        setProjectDir(session.project_dir);
        // 保存最近会话
        const newConfig = { ...config, lastSessionId: sid };
        api.config.save(newConfig).catch(() => {});
        const startResult = await api.cli.start(sid, session.project_dir, config);
        if (startResult.ok) setIsRunning(true);
      }
    } catch (err) {
      console.error('[handleSelectSession] error:', err);
      setMessages([{ role: 'system' as const, content: `加载会话失败: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() }]);
      isFirstUserMsg.current = false;
    }
  }, [sessions, config, sessionId, isRunning]);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMsg]);

  // 流式更新
  useEffect(() => {
    return api.cli.onStream((data) => {
      setStreamingMsg({
        role: 'assistant',
        content: data.text || '',
        thinking: data.thinking,
        toolSteps: data.toolSteps,
        timestamp: Date.now(),
      });
    });
  }, []);

  // 任务执行流
  const taskMsgIdsRef = useRef(new Set<string>());
  useEffect(() => {
    return api.cli.onTask((data) => {
      setTaskEvents((prev) => [...prev.slice(-200), { type: data.type, subtype: data.subtype, summary: data.summary, raw: data.raw, timestamp: data.timestamp }]);

      if ((data.type === 'system' && data.subtype === 'init') || data.type === 'result') {
        const msgId = `${data.type}_${data.subtype}_${data.timestamp}`;
        if (!taskMsgIdsRef.current.has(msgId)) {
          taskMsgIdsRef.current.add(msgId);
          const sysMsg: ChatMessage = { role: 'system', content: data.summary, timestamp: data.timestamp };
          setMessages((prev) => [...prev.slice(-500), sysMsg]);
          if (sessionId) api.session.messages.save({ sessionId, role: 'system', content: data.summary, timestamp: data.timestamp });
        }
      }
    });
  }, [sessionId]);

  // 最终结果
  useEffect(() => {
    return api.cli.onOutput((data) => {
      if (data.msgId && seenMsgIds.current.has(data.msgId)) return;
      if (data.msgId) seenMsgIds.current.add(data.msgId);

      const msg: ChatMessage = {
        role: data.role || (data.type === 'stderr' ? 'system' : 'assistant'),
        content: data.text,
        thinking: data.thinking,
        toolSteps: data.toolSteps,
        timestamp: Date.now(),
        cost: data.cost,
        duration: data.duration,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        cacheCreationTokens: data.cacheCreationTokens,
        cacheReadTokens: data.cacheReadTokens,
      };

      setStreamingMsg(null);
      setMessages((prev) => [...prev.slice(-500), msg]);

      if (sessionId) {
        api.session.messages.save({ sessionId, role: msg.role, content: msg.content, timestamp: msg.timestamp, thinking: msg.thinking, toolSteps: msg.toolSteps, cost: msg.cost, duration: msg.duration, inputTokens: msg.inputTokens, outputTokens: msg.outputTokens, cacheCreationTokens: msg.cacheCreationTokens, cacheReadTokens: msg.cacheReadTokens });
      }
    });
  }, [sessionId]);

  // CLI 退出
  useEffect(() => {
    return api.cli.onExit((data) => {
      setIsRunning(false);
      setStreamingMsg(null);
      setMessages((prev) => [...prev, { role: 'system', content: `进程已退出 (code: ${data.code}, signal: ${data.signal})`, timestamp: Date.now() }]);
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
    setTaskEvents([]);
    setStreamingMsg(null);
    setMsgSearch('');
    isFirstUserMsg.current = true;
    api.session.list().then((s) => setSessions(s as { id: string; name: string; project_dir: string }[])).catch(() => {});

    const startResult = await api.cli.start(result.id, dir, config);
    if (startResult.ok) {
      setIsRunning(true);
      const sysMsg = { role: 'system' as const, content: `会话已启动 (PID: ${startResult.pid})`, timestamp: Date.now() };
      setMessages((prev) => [...prev, sysMsg]);
      await api.session.messages.save({ sessionId: result.id, role: sysMsg.role, content: sysMsg.content, timestamp: sysMsg.timestamp });
    } else {
      setMessages((prev) => [...prev, { role: 'system' as const, content: `启动失败: ${startResult.msg}`, timestamp: Date.now() }]);
    }
  }, [projectDir, config]);

  const handleStop = useCallback(async () => {
    if (sessionId) { await api.cli.stop(sessionId); setIsRunning(false); setStreamingMsg(null); }
  }, [sessionId]);

  const handleSendInput = useCallback(async () => {
    if (inputText.trim() && sessionId && isRunning) {
      const userMsg: ChatMessage = { role: 'user', content: inputText.trim(), timestamp: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
      await api.session.messages.save({ sessionId, role: 'user', content: inputText.trim(), timestamp: userMsg.timestamp });

      // 第一条用户消息：自动生成标题
      if (isFirstUserMsg.current) {
        isFirstUserMsg.current = false;
        const title = generateTitle(inputText.trim());
        if (title) {
          await api.session.autoTitle({ sessionId, title });
          api.session.list().then((s) => setSessions(s as { id: string; name: string; project_dir: string }[])).catch(() => {});
        }
      }

      await api.cli.input(sessionId, inputText);
      setInputText('');
    }
  }, [inputText, sessionId, isRunning]);

  // 搜索过滤消息
  const filteredMessages = useMemo(() => {
    if (!msgSearch.trim()) return messages;
    const q = msgSearch.toLowerCase();
    return messages.filter(m =>
      m.content.toLowerCase().includes(q) ||
      m.thinking?.toLowerCase().includes(q) ||
      m.toolSteps?.some(s => JSON.stringify(s).toLowerCase().includes(q))
    );
  }, [messages, msgSearch]);

  const allMessages = streamingMsg ? [...filteredMessages, streamingMsg] : filteredMessages;

  // Token / 费用汇总
  const tokenSummary = useMemo(() => {
    let inputTokens = 0, outputTokens = 0, cacheTokens = 0, cost = 0;
    for (const m of messages) {
      inputTokens += m.inputTokens ?? 0;
      outputTokens += m.outputTokens ?? 0;
      cacheTokens += (m.cacheCreationTokens ?? 0) + (m.cacheReadTokens ?? 0);
      cost += m.cost ?? 0;
    }
    return { inputTokens, outputTokens, cacheTokens, cost };
  }, [messages]);

  const filteredSessions = searchText
    ? sessions.filter(s => s.name.toLowerCase().includes(searchText.toLowerCase()) || s.project_dir.toLowerCase().includes(searchText.toLowerCase()))
    : sessions;

  // 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSendInput();
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setShowShortcuts(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSendInput]);

  // textarea 自动调整高度
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [inputText]);

  const handleExport = useCallback(async () => {
    if (!sessionId) return;
    const lines: string[] = [
      `# Session: ${sessionId}`,
      `Exported: ${new Date().toLocaleString()}`,
      '',
      `## Token Summary`,
      `- Input: ${formatNum(tokenSummary.inputTokens)}`,
      `- Output: ${formatNum(tokenSummary.outputTokens)}`,
      `- Cache: ${formatNum(tokenSummary.cacheTokens)}`,
      `- Cost: $${tokenSummary.cost.toFixed(4)}`,
      '',
      '---',
      '',
    ];

    for (const m of allMessages) {
      if (m.role === 'system') continue;
      lines.push(`## ${m.role.toUpperCase()}\n`);
      if (m.thinking) {
        lines.push('<details><summary>Thinking</summary>\n');
        lines.push(m.thinking, '\n</details>\n');
      }
      if (m.toolSteps?.length) {
        lines.push('<details><summary>Tool Steps</summary>\n');
        for (const s of m.toolSteps) {
          lines.push(`- **${s.name}** [${s.status}]`);
          const cmd = typeof (s as Record<string, unknown>).input?.command === 'string'
            ? (s as Record<string, unknown>).input.command
            : JSON.stringify(s.input).slice(0, 200);
          lines.push(`  - Command: \`${cmd}\``);
          if (s.output) lines.push(`  - Output: ${s.output.slice(0, 300)}`);
        }
        lines.push('\n</details>\n');
      }
      if (m.content) lines.push(m.content, '');
      if ((m.inputTokens ?? 0) + (m.outputTokens ?? 0) > 0) {
        lines.push(`> Tokens: ↓${formatNum(m.inputTokens ?? 0)} / ↑${formatNum(m.outputTokens ?? 0)} | Cost: $${(m.cost ?? 0).toFixed(4)}\n`);
      }
      lines.push('---', '');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `session-${sessionId}.md`;
    a.click();
  }, [sessionId, allMessages, tokenSummary]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部工具栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
        borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, marginRight: 8, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {projectDir ? projectDir.split('/').pop() : '纯对话模式'}
        </span>
        <select
          className="select"
          value={String(config.model || 'claude-sonnet-4-6-20250514')}
          onChange={(e) => { setConfig(prev => ({ ...prev, model: e.target.value })); api.config.save({ ...config, model: e.target.value }).catch(() => {}); }}
          style={{ fontSize: 11, padding: '4px 8px' }}
        >
          <option value="claude-sonnet-4-6-20250514">Sonnet 4.6</option>
          <option value="claude-opus-4-6-20250514">Opus 4.6</option>
          <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
        </select>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => { const next = theme === 'dark' ? 'light' : 'dark'; onThemeChange?.(next); }}
          title="切换主题"
          style={{ fontSize: 11, padding: '4px 8px', minWidth: 50 }}
        >
          {theme === 'dark' ? '☀ 亮色' : '🌙 暗色'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleOpenProject}>📁 选择目录</button>
        <button className="btn btn-primary btn-sm" onClick={handleStartSession} disabled={isRunning}>▶ 新建会话</button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            if (sessionId && !isRunning) {
              const session = sessions.find(s => s.id === sessionId);
              if (session) { const r = await api.cli.start(sessionId, session.project_dir, config); if (r.ok) setIsRunning(true); }
              return;
            }
            const list = await api.session.list().catch(() => []) as { id: string; name: string; project_dir: string }[];
            setSessions(list);
            if (list.length > 0) handleSelectSession(list[0].id);
          }}
          disabled={isRunning}
        >
          ↻ 继续会话
        </button>
        <button className="btn btn-danger btn-sm" onClick={handleStop} disabled={!isRunning}>■ 停止运行</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={() => setShowShortcuts(true)} title="快捷键" style={{ fontSize: 11, padding: '4px 8px' }}>? 快捷键</button>
      </div>

      {/* 主内容区 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 左侧：会话列表 */}
        <div style={{ width: 200, borderRight: '1px solid var(--border-color)', padding: 8, overflow: 'auto', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>会话历史</span>
            {sessionId && (
              <button className="btn btn-sm" onClick={handleExport} style={{ fontSize: 10, padding: '2px 6px', color: 'var(--cyan)' }} title="导出为 Markdown">⬇ 导出</button>
            )}
          </div>
          <input className="input" placeholder="搜索会话..." value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', marginBottom: 8 }} />
          {filteredSessions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 8 }}>{searchText ? '无匹配会话' : '暂无会话'}</div>
          ) : (
            filteredSessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                isActive={s.id === sessionId}
                onSelect={handleSelectSession}
                onRename={async (sid, name) => {
                  await api.session.rename(sid, name);
                  api.session.list().then((list) => setSessions(list as { id: string; name: string; project_dir: string }[]));
                }}
                onDelete={async (sid) => {
                  if (sid === sessionId) { setSessionId(null); setMessages([]); }
                  await api.session.delete(sid);
                  api.session.list().then((list) => setSessions(list as { id: string; name: string; project_dir: string }[]));
                }}
              />
            ))
          )}
        </div>

        {/* 中间：聊天区 + 输入区 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 消息搜索栏 */}
          <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>搜索消息</span>
            <input
              className="input"
              placeholder="输入关键词过滤..."
              value={msgSearch}
              onChange={(e) => setMsgSearch(e.target.value)}
              style={{ fontSize: 11, padding: '3px 8px', flex: 1 }}
            />
            {msgSearch && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                {filteredMessages.length}/{messages.length} 条
              </span>
            )}
          </div>

          {/* 消息列表 */}
          <ErrorBoundary>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allMessages.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 60, fontSize: 14 }}>
                  {msgSearch ? '无匹配消息' : '暂无消息，启动会话后开始对话'}
                </div>
              ) : (
                allMessages.map((msg, i) => (
                  <ChatBubble key={i} message={msg} isStreaming={i === allMessages.length - 1 && !!streamingMsg} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </ErrorBoundary>

          {/* 快捷命令 */}
          <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {QUICK_COMMANDS.map((cmd, i) => (
              <button key={i} onClick={() => setInputText(prev => prev ? prev + '\n' + cmd.text : cmd.text)}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 11, padding: '2px 8px', color: 'var(--cyan)' }}>
                {cmd.label}
              </button>
            ))}
          </div>

          {/* 输入区 — 多行 textarea */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-card)', flexShrink: 0 }}>
            <textarea
              ref={inputRef}
              className="input"
              placeholder={isRunning ? '输入消息... (Enter 发送, Shift+Enter 换行)' : '请先启动会话'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendInput();
                }
              }}
              disabled={!isRunning}
              rows={1}
              style={{ flex: 1, resize: 'none', maxHeight: 120, lineHeight: 1.5 }}
            />
            <button className="btn btn-primary" onClick={handleSendInput} disabled={!isRunning || !inputText.trim()}>发送</button>
          </div>
        </div>

        {/* 右侧面板 */}
        <div style={{ width: 220, borderLeft: '1px solid var(--border-color)', padding: 12, overflow: 'auto', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {showTaskPanel ? '任务执行' : '上下文信息'}
            </span>
            <button className="btn btn-sm" onClick={() => setShowTaskPanel(!showTaskPanel)} style={{ fontSize: 10, padding: '2px 8px', color: 'var(--cyan)' }}>
              {showTaskPanel ? '上下文' : '任务流'}
            </button>
          </div>

          {showTaskPanel ? (
            <div style={{ overflow: 'auto', flex: 1 }}>
              {taskEvents.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 8 }}>暂无任务事件</div>
              ) : (
                taskEvents.map((evt, i) => <TaskEventItem key={i} event={evt} index={i} />)
              )}
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>当前模型</div>
                <div style={{ fontSize: 13 }}>{String(config.model || 'claude-sonnet-4-6')}</div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>项目目录</div>
                <div style={{ fontSize: 11, wordBreak: 'break-all', color: 'var(--text-secondary)' }}>{projectDir || '未选择'}</div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>运行状态</div>
                <div className="flex items-center gap-2">
                  <span className={`status-dot ${isRunning ? 'running' : 'idle'}`} />
                  <span style={{ fontSize: 13 }}>{isRunning ? '运行中' : '空闲'}</span>
                </div>
              </div>

              {/* Token / 费用汇总 */}
              {(tokenSummary.inputTokens + tokenSummary.outputTokens + tokenSummary.cost) > 0 && (
                <div style={{ marginBottom: 16, padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>费用汇总</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}>
                    <div>输入: <span style={{ color: 'var(--text-primary)' }}>{formatNum(tokenSummary.inputTokens)}</span></div>
                    <div>输出: <span style={{ color: 'var(--text-primary)' }}>{formatNum(tokenSummary.outputTokens)}</span></div>
                    {tokenSummary.cacheTokens > 0 && <div>缓存: <span style={{ color: 'var(--text-primary)' }}>{formatNum(tokenSummary.cacheTokens)}</span></div>}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 4 }}>
                      总计: <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>${tokenSummary.cost.toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              )}

              <button className="btn btn-secondary btn-sm w-full" onClick={async () => { if (sessionId) api.log.export(`/tmp/session-${sessionId}.log`, 'text'); }}>导出日志</button>
            </>
          )}
        </div>
      </div>

      {/* 底部状态栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '4px 16px',
        borderTop: '1px solid var(--border-color)', background: 'var(--bg-card)',
        fontSize: 11, color: 'var(--text-dim)', flexShrink: 0,
      }}>
        <span className={`status-dot ${isRunning ? 'running' : 'idle'}`} />
        <span>{isRunning ? '运行中' : '空闲'}</span>
        {projectDir && <span>| {projectDir.split('/').pop()}</span>}
        {(tokenSummary.inputTokens + tokenSummary.outputTokens) > 0 && (
          <span>
            | Tokens: {formatNum(tokenSummary.inputTokens + tokenSummary.outputTokens)}
            {tokenSummary.cacheTokens > 0 && <span style={{ opacity: 0.6 }}> (cache {formatNum(tokenSummary.cacheTokens)})</span>}
          </span>
        )}
        {tokenSummary.cost > 0 && <span>| ${tokenSummary.cost.toFixed(4)}</span>}
      </div>

      {/* 快捷键面板 Modal */}
      {showShortcuts && (
        <div onClick={() => setShowShortcuts(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: 24, maxWidth: 420, width: '90%',
            border: '1px solid var(--border-color)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>快捷键</h3>
              <button className="btn btn-sm" onClick={() => setShowShortcuts(false)} style={{ fontSize: 14, color: 'var(--text-dim)' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, lineHeight: 2.2 }}>
              {SHORTCUTS.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                  <kbd style={{
                    padding: '2px 8px', background: 'var(--bg-primary)', borderRadius: 4,
                    border: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)',
                    fontSize: 11, color: 'var(--text-primary)',
                  }}>{s.key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SHORTCUTS = [
  { key: '⌘/Ctrl + Enter', label: '发送消息' },
  { key: 'Shift + Enter', label: '输入换行' },
  { key: '?', label: '显示/隐藏快捷键' },
];

const QUICK_COMMANDS = [
  { label: '解释代码', text: '请解释这段代码的作用：' },
  { label: '优化建议', text: '这段代码有什么可以优化的地方？' },
  { label: '写测试', text: '请为这段代码编写单元测试：' },
  { label: '生成注释', text: '请为以下代码生成详细的中文注释：' },
  { label: '查找 Bug', text: '帮我检查以下代码是否存在潜在问题：' },
];

function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

/** 从用户第一条消息生成简短标题 */
function generateTitle(text: string): string {
  const cleaned = text.replace(/\n+/g, ' ').trim();
  if (cleaned.length <= 20) return cleaned;
  // 取前 20 字符，在词边界截断
  return cleaned.slice(0, 20).replace(/\s+\S*$/, '');
}

/** 侧边栏会话项（支持重命名、删除、继续会话） */
function SessionItem({
  session, isActive, onSelect, onRename, onDelete,
}: {
  session: { id: string; name: string; project_dir: string };
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session.name);

  const handleSave = () => {
    if (name.trim()) { onRename(session.id, name.trim()); setEditing(false); }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 8px', fontSize: 12, borderRadius: 4,
      color: isActive ? 'var(--cyan)' : 'var(--text-secondary)',
      background: isActive ? 'rgba(0,229,255,0.08)' : 'transparent',
    }}>
      {editing ? (
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setName(session.name); setEditing(false); } }}
          style={{ fontSize: 12, padding: '2px 6px', width: '100%' }}
        />
      ) : (
        <>
          <span onDoubleClick={() => { setEditing(true); setName(session.name); }}
            onClick={() => onSelect(session.id)}
            style={{ flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.name}
          </span>
          <button className="btn btn-sm" onClick={() => onSelect(session.id)}
            style={{ fontSize: 10, padding: '2px 6px', color: 'var(--cyan)', background: 'transparent', border: 'none', cursor: 'pointer', marginLeft: 4, flexShrink: 0 }}
            title="继续该会话">▶</button>
          <button className="btn btn-sm" onClick={() => { if (confirm('确定删除会话「' + session.name + '」？')) onDelete(session.id); }}
            style={{ fontSize: 10, padding: '2px 4px', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', marginLeft: 2, flexShrink: 0 }}
            title="删除会话">✕</button>
        </>
      )}
    </div>
  );
}

/** 任务事件项 */
function TaskEventItem({ event }: { event: { type: string; subtype: string; summary: string; raw: string; timestamp: number } }) {
  const [expanded, setExpanded] = useState(false);

  const typeColor: Record<string, string> = { system: 'var(--cyan)', assistant: 'var(--purple)', result: 'var(--success)', user: 'var(--text-primary)' };
  const typeIcon: Record<string, string> = { system: '⚙', assistant: '💬', result: '✓', user: '👤' };

  const color = typeColor[event.type] || 'var(--text-dim)';
  const icon = typeIcon[event.type] || '•';

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ fontSize: 10, lineHeight: 1.4 }}>{icon}</span>
        <div style={{ flex: 1, fontSize: 11, color, lineHeight: 1.4 }}>{event.summary}</div>
      </div>
      {expanded && event.raw && (
        <pre style={{
          marginTop: 4, padding: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 4,
          fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          maxHeight: 150, overflow: 'auto',
        }}>
          {(() => { try { return JSON.stringify(JSON.parse(event.raw), null, 2).slice(0, 1500); } catch { return event.raw.slice(0, 1500); } })()}
        </pre>
      )}
    </div>
  );
}
