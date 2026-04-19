// 引入 React 核心钩子：状态、副作用、回调、引用、缓存
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// 引入 React Router 的 useLocation 钩子，用于获取路由导航状态
import { useLocation } from 'react-router-dom';
// 引入 API 封装，用于与后端通信
import { api } from '../lib/api';
// 引入聊天消息气泡组件及其消息类型定义
import ChatBubble, { ChatMessage } from '../components/ChatBubble';
// 引入错误边界组件，防止子组件崩溃影响整个页面
import ErrorBoundary from '../components/ErrorBoundary';

// 导出主组件 Workspace：工作区/聊天页面
// theme: 当前主题（dark/light）
// onThemeChange: 切换主题的回调函数
export default function Workspace({ theme, onThemeChange }: { theme?: string; onThemeChange?: (t: string) => void }) {
  // 获取当前路由位置信息，用于检测从 Home 页面导航过来的会话
  const location = useLocation();
  // 当前项目目录路径
  const [projectDir, setProjectDir] = useState<string | null>(null);
  // 当前会话 ID
  const [sessionId, setSessionId] = useState<string | null>(null);
  // CLI 进程是否正在运行
  const [isRunning, setIsRunning] = useState(false);
  // 聊天消息列表
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 用户输入框中的文本
  const [inputText, setInputText] = useState('');
  // 侧边栏会话列表
  const [sessions, setSessions] = useState<{ id: string; name: string; project_dir: string }[]>([]);
  // 当前配置（模型选择、主题等）
  const [config, setConfig] = useState<Record<string, unknown>>({});
  // 侧边栏会话搜索文本
  const [searchText, setSearchText] = useState('');
  // 指向消息列表底部的引用，用于自动滚动
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 记录已显示消息 ID 的集合，防止重复渲染
  const seenMsgIds = useRef(new Set<string>());
  // 输入框的 DOM 引用，用于调整高度等操作
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 标记是否为用户的第一条消息，用于自动生成会话标题
  const isFirstUserMsg = useRef(true);

  // 任务执行流：是否显示任务面板
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  // 任务事件列表：包含类型、子类型、摘要、原始数据和时间戳
  const [taskEvents, setTaskEvents] = useState<{ type: string; subtype: string; summary: string; raw: string; timestamp: number }[]>([]);

  // 流式消息：当前正在流式输出的消息
  const [streamingMsg, setStreamingMsg] = useState<ChatMessage | null>(null);

  // 会话内消息搜索关键词
  const [msgSearch, setMsgSearch] = useState('');

  // 快捷键面板是否显示
  const [showShortcuts, setShowShortcuts] = useState(false);

  // 左侧会话列表面板显隐
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  // 右侧上下文面板显隐
  const [showRightPanel, setShowRightPanel] = useState(true);

  // 组件挂载时：加载配置和会话列表，自动恢复最近一次会话
  useEffect(() => {
    // 获取配置
    api.config.get().then(cfg => {
      setConfig(cfg);
      // 如果配置中包含主题，则应用
      if (cfg.theme && typeof cfg.theme === 'string') {
        onThemeChange?.(cfg.theme);
      }
    }).catch(() => {});
    // 获取会话列表
    api.session.list().then((s) => {
      // 将返回数据转为带类型的会话数组
      const typed = s as { id: string; name: string; project_dir: string }[];
      setSessions(typed);
      // 如果有会话，自动选择第一个（最新）
      if (typed.length > 0) {
        // 直接传 project_dir，不依赖 sessions.find()
        handleSelectSession(typed[0].id, typed[0].project_dir);
      }
    }).catch(() => {});
    // 加载技能列表
    api.skill.list().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从 Home / Sessions / Logs 页面导航过来时，恢复指定的会话
  useEffect(() => {
    // 从路由状态中提取会话信息
    const state = location.state as { sessionId?: string; projectDir?: string } | undefined;
    // 如果带有 sessionId，则切换到该会话
    if (state?.sessionId) {
      handleSelectSession(state.sessionId, state.projectDir);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // 选择/切换会话的回调函数
  const handleSelectSession = useCallback(async (sid: string, projectDir?: string) => {
    try {
      // 如果当前有正在运行的会话且不是目标会话，先停止
      if (sessionId && isRunning && sessionId !== sid) {
        await api.cli.stop(sessionId);
      }
      // 更新当前会话 ID
      setSessionId(sid);
      // 清空已显示消息 ID 集合
      seenMsgIds.current.clear();
      // 清空任务消息 ID 引用
      taskMsgIdsRef.current.clear();
      // 清空消息搜索关键词
      setMsgSearch('');

      // 加载该会话的所有历史消息
      const msgs = await api.session.messages.load(sid) as { id: number; role: string; content: string; thinking: string | null; tool_steps: string | null; cost: number | null; duration: number | null; input_tokens: number | null; output_tokens: number | null; cache_creation_tokens: number | null; cache_read_tokens: number | null; timestamp: number }[];
      // 将原始消息数据转换为 ChatMessage 格式
      const parsedMsgs = (msgs || []).map(m => {
        // 尝试解析工具调用步骤
        let parsedSteps: unknown[] | undefined;
        if (m?.tool_steps) {
          try { parsedSteps = JSON.parse(m.tool_steps); } catch { /* 解析失败则忽略 */ }
        }
        // 返回格式化后的消息对象
        return {
          id: m.id,
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
      // 更新消息列表
      setMessages(parsedMsgs);
      // 如果已有用户消息，说明不是第一次对话（用于标题生成判断）
      isFirstUserMsg.current = !parsedMsgs.some(m => m.role === 'user');
      // 清除流式消息
      setStreamingMsg(null);

      // 获取项目目录：优先使用参数，否则从会话列表中查找
      const dir = projectDir || sessions.find(s => s.id === sid)?.project_dir;
      if (dir) {
        setProjectDir(dir);
        // 保存最近会话 ID 到配置中
        // 保存最近会话（后端会合并到已有配置）
        api.config.save({ lastSessionId: sid }).catch(() => {});
        // 启动 CLI 进程
        const startResult = await api.cli.start(sid, dir, config);
        // 启动成功则标记为运行中
        if (startResult.ok) setIsRunning(true);
      }
    } catch (err) {
      // 出错时打印错误并在界面显示
      console.error('[handleSelectSession] error:', err);
      setMessages([{ role: 'system' as const, content: `加载会话失败: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() }]);
      isFirstUserMsg.current = false;
    }
  }, [sessions, config, sessionId, isRunning]);

  // 当消息列表或流式消息更新时，自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMsg]);

  // 监听 CLI 流式输出事件，实时更新流式消息
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

  // 任务事件引用集合，用于去重
  const taskMsgIdsRef = useRef(new Set<string>());
  // 监听 CLI 任务事件，将系统事件追加到消息列表
  useEffect(() => {
    return api.cli.onTask((data) => {
      // 追加任务事件（保留最近 200 条）
      setTaskEvents((prev) => [...prev.slice(-200), { type: data.type, subtype: data.subtype, summary: data.summary, raw: data.raw, timestamp: data.timestamp }]);

      // 系统初始化事件或结果事件需要追加到聊天消息中
      if ((data.type === 'system' && data.subtype === 'init') || data.type === 'result') {
        // 生成唯一消息 ID 用于去重
        const msgId = `${data.type}_${data.subtype}_${data.timestamp}`;
        if (!taskMsgIdsRef.current.has(msgId)) {
          taskMsgIdsRef.current.add(msgId);
          // 构建系统消息
          const sysMsg: ChatMessage = { role: 'system', content: data.summary, timestamp: data.timestamp };
          // 追加到消息列表（保留最近 500 条）
          setMessages((prev) => [...prev.slice(-500), sysMsg]);
          // 持久化到后端
          if (sessionId) api.session.messages.save({ sessionId, role: 'system', content: data.summary, timestamp: data.timestamp });
        }
      }
    });
  }, [sessionId]);

  // 监听 CLI 最终输出事件，将完整消息追加到聊天列表
  useEffect(() => {
    return api.cli.onOutput((data) => {
      // 消息去重：如果已处理过则跳过
      if (data.msgId && seenMsgIds.current.has(data.msgId)) return;
      if (data.msgId) seenMsgIds.current.add(data.msgId);

      // 构建聊天消息对象
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

      // 清除流式消息（因为最终结果已到达）
      setStreamingMsg(null);
      // 追加消息到列表（保留最近 500 条）
      setMessages((prev) => [...prev.slice(-500), msg]);

      // 持久化消息到后端
      if (sessionId) {
        api.session.messages.save({ sessionId, role: msg.role, content: msg.content, timestamp: msg.timestamp, thinking: msg.thinking, toolSteps: msg.toolSteps, cost: msg.cost, duration: msg.duration, inputTokens: msg.inputTokens, outputTokens: msg.outputTokens, cacheCreationTokens: msg.cacheCreationTokens, cacheReadTokens: msg.cacheReadTokens });
      }
    });
  }, [sessionId]);

  // 监听 CLI 进程退出事件
  useEffect(() => {
    return api.cli.onExit((data) => {
      setIsRunning(false);
      setStreamingMsg(null);
      // 在消息列表中追加退出信息
      setMessages((prev) => [...prev, { role: 'system', content: `进程已退出 (code: ${data.code}, signal: ${data.signal})`, timestamp: Date.now() }]);
    });
  }, []);

  // 打开项目目录选择对话框
  const handleOpenProject = useCallback(async () => {
    const dir = await api.fs.selectDirectory();
    if (dir) setProjectDir(dir);
  }, []);

  // 创建新会话
  const handleStartSession = useCallback(async () => {
    // 获取项目目录：优先使用已有，否则弹出选择框，最后回退到当前工作目录
    const dir = projectDir || (await api.fs.selectDirectory()) || process.cwd?.() || '~';
    // 创建会话
    const result = await api.session.create({ projectDir: dir, name: '新会话' }) as { id: string };
    // 更新会话 ID
    setSessionId(result.id);
    setProjectDir(dir);
    // 清空旧数据
    setMessages([]);
    setTaskEvents([]);
    setStreamingMsg(null);
    setMsgSearch('');
    isFirstUserMsg.current = true;
    // 刷新会话列表
    api.session.list().then((s) => setSessions(s as { id: string; name: string; project_dir: string }[])).catch(() => {});

    // 启动 CLI 进程
    const startResult = await api.cli.start(result.id, dir, config);
    // 根据启动结果显示系统消息
    if (startResult.ok) {
      setIsRunning(true);
      const sysMsg = { role: 'system' as const, content: `会话已启动 (PID: ${startResult.pid})`, timestamp: Date.now() };
      setMessages((prev) => [...prev, sysMsg]);
      // 持久化系统消息
      await api.session.messages.save({ sessionId: result.id, role: sysMsg.role, content: sysMsg.content, timestamp: sysMsg.timestamp });
    } else {
      setMessages((prev) => [...prev, { role: 'system' as const, content: `启动失败: ${startResult.msg}`, timestamp: Date.now() }]);
    }
  }, [projectDir, config]);

  // 停止当前运行的会话
  const handleStop = useCallback(async () => {
    if (sessionId) { await api.cli.stop(sessionId); setIsRunning(false); setStreamingMsg(null); }
  }, [sessionId]);

  // 删除指定消息
  const handleDeleteMessage = useCallback(async (msgId: number) => {
    if (!sessionId) return;
    // 从后端删除
    await api.session.messages.delete(sessionId, msgId);
    // 从前端状态中移除
    setMessages(prev => prev.filter(m => m.id !== msgId));
  }, [sessionId]);

  // 发送用户输入
  const handleSendInput = useCallback(async () => {
    // 检查输入非空、有会话且 CLI 正在运行
    if (inputText.trim() && sessionId && isRunning) {
      // 构建用户消息
      const userMsg: ChatMessage = { role: 'user', content: inputText.trim(), timestamp: Date.now() };
      // 显示在聊天中
      setMessages((prev) => [...prev, userMsg]);
      // 持久化到后端
      await api.session.messages.save({ sessionId, role: 'user', content: inputText.trim(), timestamp: userMsg.timestamp });

      // 第一条用户消息时自动生成会话标题
      if (isFirstUserMsg.current) {
        isFirstUserMsg.current = false;
        const title = generateTitle(inputText.trim());
        if (title) {
          // 更新会话标题
          await api.session.autoTitle({ sessionId, title });
          // 刷新会话列表以显示新标题
          api.session.list().then((s) => setSessions(s as { id: string; name: string; project_dir: string }[])).catch(() => {});
        }
      }

      // 将输入发送给 CLI
      await api.cli.input(sessionId, inputText);
      // 清空输入框
      setInputText('');
    }
  }, [inputText, sessionId, isRunning]);

  // 根据搜索关键词过滤消息（使用 useMemo 缓存）
  const filteredMessages = useMemo(() => {
    // 没有搜索词则返回全部消息
    if (!msgSearch.trim()) return messages;
    // 将搜索词转为小写用于不区分大小写的匹配
    const q = msgSearch.toLowerCase();
    return messages.filter(m =>
      m.content.toLowerCase().includes(q) ||
      m.thinking?.toLowerCase().includes(q) ||
      m.toolSteps?.some(s => JSON.stringify(s).toLowerCase().includes(q))
    );
  }, [messages, msgSearch]);

  // 合并过滤后的消息和当前流式消息
  const allMessages = streamingMsg ? [...filteredMessages, streamingMsg] : filteredMessages;

  // 使用 useMemo 计算 Token 和费用汇总
  const tokenSummary = useMemo(() => {
    let inputTokens = 0, outputTokens = 0, cacheTokens = 0, cost = 0;
    // 遍历所有消息累加各项统计
    for (const m of messages) {
      inputTokens += m.inputTokens ?? 0;
      outputTokens += m.outputTokens ?? 0;
      cacheTokens += (m.cacheCreationTokens ?? 0) + (m.cacheReadTokens ?? 0);
      cost += m.cost ?? 0;
    }
    return { inputTokens, outputTokens, cacheTokens, cost };
  }, [messages]);

  // 根据搜索文本过滤会话列表
  const filteredSessions = searchText
    ? sessions.filter(s => s.name.toLowerCase().includes(searchText.toLowerCase()) || s.project_dir.toLowerCase().includes(searchText.toLowerCase()))
    : sessions;

  // 注册全局键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Enter 发送消息
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSendInput();
      }
      // 按 ? 切换快捷键面板（且没有其他修饰键）
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setShowShortcuts(prev => !prev);
      }
    };
    // 绑定键盘事件
    window.addEventListener('keydown', handler);
    // 组件卸载时移除事件监听
    return () => window.removeEventListener('keydown', handler);
  }, [handleSendInput]);

  // 监听输入文本变化，自动调整 textarea 高度
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      // 先重置高度为 auto，再根据内容设置
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [inputText]);

  // 导出当前会话为 Markdown 文件
  const handleExport = useCallback(async () => {
    if (!sessionId) return;
    // 构建 Markdown 内容的行数组
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

    // 遍历消息，逐条生成 Markdown 内容
    for (const m of allMessages) {
      // 跳过系统消息
      if (m.role === 'system') continue;
      lines.push(`## ${m.role.toUpperCase()}\n`);
      // 如果有思考过程，使用折叠标签包裹
      if (m.thinking) {
        lines.push('<details><summary>Thinking</summary>\n');
        lines.push(m.thinking, '\n</details>\n');
      }
      // 如果有工具调用步骤，使用折叠标签包裹
      if (m.toolSteps?.length) {
        lines.push('<details><summary>Tool Steps</summary>\n');
        for (const s of m.toolSteps) {
          lines.push(`- **${s.name}** [${s.status}]`);
          // 提取命令文本
          const cmd = typeof (s as Record<string, unknown>).input?.command === 'string'
            ? (s as Record<string, unknown>).input.command
            : JSON.stringify(s.input).slice(0, 200);
          lines.push(`  - Command: \`${cmd}\``);
          // 截取前 300 字符的输出
          if (s.output) lines.push(`  - Output: ${s.output.slice(0, 300)}`);
        }
        lines.push('\n</details>\n');
      }
      // 写入消息内容
      if (m.content) lines.push(m.content, '');
      // 如果有 Token 信息，追加到引用中
      if ((m.inputTokens ?? 0) + (m.outputTokens ?? 0) > 0) {
        lines.push(`> Tokens: ↓${formatNum(m.inputTokens ?? 0)} / ↑${formatNum(m.outputTokens ?? 0)} | Cost: $${(m.cost ?? 0).toFixed(4)}\n`);
      }
      lines.push('---', '');
    }

    // 创建 Blob 对象并触发浏览器下载
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `session-${sessionId}.md`;
    a.click();
  }, [sessionId, allMessages, tokenSummary]);

  // JSX 渲染部分开始（以下为界面布局，不添加注释）
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
            if (list.length > 0) handleSelectSession(list[0].id, list[0].project_dir);
          }}
          disabled={isRunning}
        >
          ↻ 继续会话
        </button>
        <button className="btn btn-danger btn-sm" onClick={handleStop} disabled={!isRunning}>■ 停止运行</button>
        <div style={{ flex: 1 }} />
        <button className={`btn btn-sm ${showLeftPanel ? 'btn-secondary' : ''}`} onClick={() => setShowLeftPanel(!showLeftPanel)} title="切换会话列表" style={{ fontSize: 11, padding: '4px 8px' }}>
          {showLeftPanel ? '◧ 隐藏会话' : '◧ 显示会话'}
        </button>
        <button className={`btn btn-sm ${showRightPanel ? 'btn-secondary' : ''}`} onClick={() => setShowRightPanel(!showRightPanel)} title="切换上下文" style={{ fontSize: 11, padding: '4px 8px' }}>
          {showRightPanel ? '◨ 隐藏面板' : '◨ 显示面板'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowShortcuts(true)} title="快捷键" style={{ fontSize: 11, padding: '4px 8px' }}>? 快捷键</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {showLeftPanel && (
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
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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

          <ErrorBoundary>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allMessages.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 60, fontSize: 14 }}>
                  {msgSearch ? '无匹配消息' : '暂无消息，启动会话后开始对话'}
                </div>
              ) : (
                allMessages.map((msg, i) => (
                  <ChatBubble key={i} message={msg} isStreaming={i === allMessages.length - 1 && !!streamingMsg}
                    messageId={msg.id} onDelete={msg.id ? () => handleDeleteMessage(msg.id!) : undefined} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </ErrorBoundary>

          <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {QUICK_COMMANDS.map((cmd, i) => (
              <button key={i} onClick={() => setInputText(prev => prev ? prev + '\n' + cmd.text : cmd.text)}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 11, padding: '2px 8px', color: 'var(--cyan)' }}>
                {cmd.label}
              </button>
            ))}
          </div>

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

        {showRightPanel && (
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
        )}
      </div>

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

// 快捷键列表配置
const SHORTCUTS = [
  { key: '⌘/Ctrl + Enter', label: '发送消息' },
  { key: 'Shift + Enter', label: '输入换行' },
  { key: '?', label: '显示/隐藏快捷键' },
];

// 快捷命令列表：点击即可插入预设文本到输入框
const QUICK_COMMANDS = [
  { label: '解释代码', text: '请解释这段代码的作用：' },
  { label: '优化建议', text: '这段代码有什么可以优化的地方？' },
  { label: '写测试', text: '请为这段代码编写单元测试：' },
  { label: '生成注释', text: '请为以下代码生成详细的中文注释：' },
  { label: '查找 Bug', text: '帮我检查以下代码是否存在潜在问题：' },
];

// 格式化数字：超过 1000 时显示为 k 单位
function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// 从用户消息生成简短的会话标题（截取前 20 字符，在词边界截断）
function generateTitle(text: string): string {
  const cleaned = text.replace(/\n+/g, ' ').trim();
  if (cleaned.length <= 20) return cleaned;
  // 取前 20 字符，在词边界截断
  return cleaned.slice(0, 20).replace(/\s+\S*$/, '');
}

// 侧边栏会话项组件：支持重命名、删除、继续会话
function SessionItem({
  session, isActive, onSelect, onRename, onDelete,
}: {
  session: { id: string; name: string; project_dir: string };
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  // 是否处于编辑（重命名）状态
  const [editing, setEditing] = useState(false);
  // 当前会话名称（可编辑）
  const [name, setName] = useState(session.name);

  // 保存重命名结果
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

// 任务事件列表项组件：可展开查看原始数据
function TaskEventItem({ event }: { event: { type: string; subtype: string; summary: string; raw: string; timestamp: number } }) {
  // 是否展开显示原始数据
  const [expanded, setExpanded] = useState(false);

  // 事件类型与颜色的映射
  const typeColor: Record<string, string> = { system: 'var(--cyan)', assistant: 'var(--purple)', result: 'var(--success)', user: 'var(--text-primary)' };
  // 事件类型与图标的映射
  const typeIcon: Record<string, string> = { system: '⚙', assistant: '💬', result: '✓', user: '👤' };

  // 根据事件类型获取颜色和图标
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
