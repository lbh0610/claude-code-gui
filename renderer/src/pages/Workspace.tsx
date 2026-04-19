// 引入 React 核心钩子：状态、副作用、回调、引用、缓存
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// 引入 React Router 的 useLocation 钩子，用于获取路由导航信息
import { useLocation } from 'react-router-dom';
// 引入 API 封装，用于与后端通信
import { api } from '../lib/api';
// 引入聊天消息气泡组件及其消息类型定义
import ChatBubble, { ChatMessage } from '../components/ChatBubble';
// 引入错误边界组件，防止子组件崩溃影响整个页面
import ErrorBoundary from '../components/ErrorBoundary';
import FileExplorer from '../components/FileExplorer';
import EmbeddedTerminal from '../components/EmbeddedTerminal';
import TemplatePicker from '../components/TemplatePicker';
import ToolsPanel from '../components/ToolsPanel';
import ImagePreview, { AttachedImage } from '../components/ImagePreview';

/** 单个会话 Tab 的完整状态 */
interface SessionTab {
  sessionId: string;
  projectDir: string;
  name: string;
  messages: ChatMessage[];
  isRunning: boolean;
  streamingMsg: ChatMessage | null;
  taskEvents: { type: string; subtype: string; summary: string; raw: string; timestamp: number }[];
  taskMsgIds: Set<string>;
  seenMsgIds: Set<string>;
  isFirstUserMsg: boolean;
  loadingMessages: boolean;
  budgetLimit: number | null;
  currentCost: number;
}

// 创建空的 SessionTab
function createEmptyTab(sessionId: string, projectDir: string, name: string): SessionTab {
  return {
    sessionId,
    projectDir,
    name,
    messages: [],
    isRunning: false,
    streamingMsg: null,
    taskEvents: [],
    taskMsgIds: new Set(),
    seenMsgIds: new Set(),
    isFirstUserMsg: true,
    loadingMessages: false,
    budgetLimit: null,
    currentCost: 0,
  };
}

// 导出主组件 Workspace：工作区/聊天页面
// theme: 当前主题（dark/light）
// onThemeChange: 切换主题的回调函数
export default function Workspace({ theme, onThemeChange }: { theme?: string; onThemeChange?: (t: string) => void }) {
  // 获取当前路由位置信息，用于检测从 Home 页面导航过来的会话
  const location = useLocation();
  // 当前项目目录路径（用于文件浏览器）
  const [projectDir, setProjectDir] = useState<string | null>(null);
  // 当前活跃 Tab 的 sessionId
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // Tabs Map：key=sessionId，value=SessionTab
  const [tabs, setTabs] = useState<Map<string, SessionTab>>(new Map());
  // 当前配置（模型选择、主题等）
  const [config, setConfig] = useState<Record<string, unknown>>({});
  // 侧边栏会话列表
  const [sessions, setSessions] = useState<{ id: string; name: string; project_dir: string }[]>([]);
  // 侧边栏会话搜索文本
  const [searchText, setSearchText] = useState('');
  // 消息加载状态（从活跃 tab 派生）
  // 输入框的文本
  const [inputText, setInputText] = useState('');
  // 输入框的 DOM 引用，用于调整高度等操作
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 任务执行流：是否显示任务面板（从活跃 tab 派生）
  // 快捷键面板是否显示
  const [showShortcuts, setShowShortcuts] = useState(false);

  // 左侧会话列表面板显隐
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  // 右侧上下文面板显隐
  const [showRightPanel, setShowRightPanel] = useState(true);
  // 左侧面板宽度（拖拽调整）
  const [leftPanelWidth, setLeftPanelWidth] = useState(200);
  // 终端高度
  const [terminalHeight, setTerminalHeight] = useState(160);
  // 终端显隐
  const [showTerminal, setShowTerminal] = useState(false);
  // 右侧面板标签 (context/tools/files)
  const [rightPanelTab, setRightPanelTab] = useState<'context' | 'tools' | 'files'>('context');

  // 附件图片
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  // 拖拽进入状态
  const [isDragOver, setIsDragOver] = useState(false);

  // 获取当前活跃 Tab
  const activeTab = activeTabId ? tabs.get(activeTabId) : null;
  // 从活跃 Tab 派生的状态
  const sessionId = activeTab?.sessionId || null;
  const messages = activeTab?.messages || [];
  const isRunning = activeTab?.isRunning || false;
  const streamingMsg = activeTab?.streamingMsg || null;
  const taskEvents = activeTab?.taskEvents || [];
  const loadingMessages = activeTab?.loadingMessages || false;
  const budgetLimit = activeTab?.budgetLimit ?? null;
  const currentCost = activeTab?.currentCost ?? 0;

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

  // 加载会话数据到指定 Tab
  const loadSessionToTab = useCallback(async (tabId: string, sid: string, dir: string) => {
    setTabs(prev => {
      const next = new Map(prev);
      const tab = next.get(tabId);
      if (tab) {
        next.set(tabId, { ...tab, loadingMessages: true });
      }
      return next;
    });

    try {
      // 加载该会话的所有历史消息
      const msgs = await api.session.messages.load(sid) as { id: number; role: string; content: string; thinking: string | null; tool_steps: string | null; cost: number | null; duration: number | null; input_tokens: number | null; output_tokens: number | null; cache_creation_tokens: number | null; cache_read_tokens: number | null; timestamp: number }[];
      // 将原始消息数据转换为 ChatMessage 格式
      const parsedMsgs = (msgs || []).map(m => {
        let parsedSteps: unknown[] | undefined;
        if (m?.tool_steps) {
          try { parsedSteps = JSON.parse(m.tool_steps); } catch { /* 解析失败则忽略 */ }
        }
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

      // 获取费用预算
      let budget: { budgetLimit: number | null; currentCost: number } = { budgetLimit: null, currentCost: 0 };
      try { budget = await api.session.getBudget(sid); } catch { /* ignore */ }

      setTabs(prev => {
        const next = new Map(prev);
        const tab = next.get(tabId);
        if (tab) {
          next.set(tabId, {
            ...tab,
            messages: parsedMsgs,
            isFirstUserMsg: !parsedMsgs.some(m => m.role === 'user'),
            streamingMsg: null,
            taskEvents: [],
            taskMsgIds: new Set(),
            seenMsgIds: new Set(),
            loadingMessages: false,
            budgetLimit: budget.budgetLimit,
            currentCost: budget.currentCost,
          });
        }
        return next;
      });
    } catch (err) {
      console.error('[loadSessionToTab] error:', err);
      setTabs(prev => {
        const next = new Map(prev);
        const tab = next.get(tabId);
        if (tab) {
          next.set(tabId, {
            ...tab,
            messages: [{ role: 'system' as const, content: `加载会话失败: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() }],
            loadingMessages: false,
          });
        }
        return next;
      });
    }
  }, []);

  // 选择/切换会话 — 如果 Tab 已存在则激活，否则创建新 Tab
  const handleSelectSession = useCallback(async (sid: string, projectDir?: string) => {
    // 如果已有该会话的 Tab，直接激活
    if (tabs.has(sid)) {
      setActiveTabId(sid);
      setProjectDir(tabs.get(sid)!.projectDir);
      return;
    }

    const dir = projectDir || sessions.find(s => s.id === sid)?.project_dir;
    if (!dir) return;

    const newTab = createEmptyTab(sid, dir, sessions.find(s => s.id === sid)?.name || '会话');
    setTabs(prev => new Map(prev).set(sid, newTab));
    setActiveTabId(sid);
    setProjectDir(dir);

    // 如果当前有正在运行的会话且不是目标会话，先停止
    if (sessionId && isRunning && sessionId !== sid) {
      await api.cli.stop(sessionId);
    }

    // 保存最近会话 ID 到配置中
    api.config.save({ lastSessionId: sid }).catch(() => {});

    // 加载历史消息
    await loadSessionToTab(sid, sid, dir);

    // 启动 CLI 进程
    const startResult = await api.cli.start(sid, dir, config);
    if (startResult.ok) {
      setTabs(prev => {
        const next = new Map(prev);
        const tab = next.get(sid);
        if (tab) next.set(sid, { ...tab, isRunning: true });
        return next;
      });
    }
  }, [tabs, sessions, config, sessionId, isRunning, loadSessionToTab]);

  // 新建会话 — 打开新 Tab
  const handleStartSession = useCallback(async () => {
    const dir = projectDir || (await api.fs.selectDirectory()) || process.cwd?.() || '~';
    const result = await api.session.create({ projectDir: dir, name: '新会话' }) as { id: string };
    const sid = result.id;

    const newTab = createEmptyTab(sid, dir, '新会话');
    setTabs(prev => new Map(prev).set(sid, newTab));
    setActiveTabId(sid);
    setProjectDir(dir);

    // 刷新会话列表
    api.session.list().then((s) => setSessions(s as { id: string; name: string; project_dir: string }[])).catch(() => {});

    // 启动 CLI 进程
    const startResult = await api.cli.start(sid, dir, config);
    if (startResult.ok) {
      setTabs(prev => {
        const next = new Map(prev);
        const tab = next.get(sid);
        if (tab) {
          next.set(sid, {
            ...tab,
            isRunning: true,
            messages: [...tab.messages, { role: 'system' as const, content: `会话已启动 (PID: ${startResult.pid})`, timestamp: Date.now() }],
          });
        }
        return next;
      });
      // 持久化系统消息
      await api.session.messages.save({ sessionId: sid, role: 'system', content: `会话已启动 (PID: ${startResult.pid})`, timestamp: Date.now() });
    } else {
      setTabs(prev => {
        const next = new Map(prev);
        const tab = next.get(sid);
        if (tab) {
          next.set(sid, {
            ...tab,
            messages: [...tab.messages, { role: 'system' as const, content: `启动失败: ${startResult.msg}`, timestamp: Date.now() }],
          });
        }
        return next;
      });
    }
  }, [projectDir, config]);

  // 关闭 Tab
  const handleCloseTab = useCallback(async (sid: string) => {
    if (sid === sessionId && isRunning) {
      await api.cli.stop(sid);
    }
    setTabs(prev => {
      const next = new Map(prev);
      next.delete(sid);
      return next;
    });
    // 如果关闭的是当前活跃 Tab，切换到最后一个 Tab
    if (activeTabId === sid) {
      // We need to use setTimeout to read the updated tabs state
      setTimeout(() => {
        setTabs(prev => {
          const keys = Array.from(prev.keys());
          if (keys.length > 0) {
            setActiveTabId(keys[keys.length - 1]);
            const last = prev.get(keys[keys.length - 1]);
            if (last) setProjectDir(last.projectDir);
          } else {
            setActiveTabId(null);
            setProjectDir(null);
          }
          return prev;
        });
      }, 0);
    }
  }, [sessionId, isRunning, activeTabId]);

  // 停止当前运行的会话
  const handleStop = useCallback(async () => {
    if (sessionId) {
      await api.cli.stop(sessionId);
      setTabs(prev => {
        const next = new Map(prev);
        const tab = next.get(sessionId);
        if (tab) next.set(sessionId, { ...tab, isRunning: false, streamingMsg: null });
        return next;
      });
    }
  }, [sessionId]);

  // 删除指定消息
  const handleDeleteMessage = useCallback(async (msgId: number) => {
    if (!sessionId) return;
    await api.session.messages.delete(sessionId, msgId);
    setTabs(prev => {
      const next = new Map(prev);
      const tab = next.get(sessionId);
      if (tab) {
        next.set(sessionId, { ...tab, messages: tab.messages.filter(m => m.id !== msgId) });
      }
      return next;
    });
  }, [sessionId]);

  // 更新单个 Tab 状态（helper）
  const updateTab = useCallback((sid: string, updater: (tab: SessionTab) => Partial<SessionTab>) => {
    setTabs(prev => {
      const next = new Map(prev);
      const tab = next.get(sid);
      if (tab) next.set(sid, { ...tab, ...updater(tab) });
      return next;
    });
  }, []);

  // 发送用户输入
  const handleSendInput = useCallback(async () => {
    if (!inputText.trim() || !sessionId || !isRunning) return;

    // 拼接附件图片
    let finalText = inputText.trim();
    if (attachedImages.length > 0) {
      const imageMarkdown = attachedImages.map(img => `![${img.name}](${img.dataUrl})`).join('\n');
      finalText = imageMarkdown + '\n\n' + finalText;
      setAttachedImages([]);
    }

    const userMsg: ChatMessage = { role: 'user', content: finalText, timestamp: Date.now() };
    updateTab(sessionId, () => ({ messages: [...messages, userMsg] }));
    await api.session.messages.save({ sessionId, role: 'user', content: finalText, timestamp: userMsg.timestamp });

    // 第一条用户消息时自动生成会话标题
    if (activeTab?.isFirstUserMsg) {
      updateTab(sessionId, () => ({ isFirstUserMsg: false }));
      const title = generateTitle(inputText.trim());
      if (title) {
        await api.session.autoTitle({ sessionId, title });
        api.session.list().then((s) => setSessions(s as { id: string; name: string; project_dir: string }[])).catch(() => {});
      }
    }

    await api.cli.input(sessionId, inputText);
    setInputText('');
  }, [inputText, sessionId, isRunning, attachedImages, activeTab, messages, updateTab]);

  // 监听 CLI 流式输出事件 — 按 sessionId 分发
  useEffect(() => {
    return api.cli.onStream((data) => {
      const sid = data.sessionId;
      updateTab(sid, () => ({
        streamingMsg: {
          role: 'assistant',
          content: data.text || '',
          thinking: data.thinking,
          toolSteps: data.toolSteps,
          timestamp: Date.now(),
        },
      }));
    });
  }, [updateTab]);

  // 监听 CLI 任务事件 — 按 sessionId 分发
  useEffect(() => {
    return api.cli.onTask((data) => {
      const sid = data.sessionId;
      updateTab(sid, (tab) => {
        const newEvents = [...tab.taskEvents.slice(-200), { type: data.type, subtype: data.subtype, summary: data.summary, raw: data.raw, timestamp: data.timestamp }];
        let newMessages = [...tab.messages];
        if ((data.type === 'system' && data.subtype === 'init') || data.type === 'result') {
          const msgId = `${data.type}_${data.subtype}_${data.timestamp}`;
          if (!tab.taskMsgIds.has(msgId)) {
            const newIds = new Set(tab.taskMsgIds);
            newIds.add(msgId);
            newMessages = [...newMessages.slice(-500), { role: 'system' as const, content: data.summary, timestamp: data.timestamp }];
            if (sid) api.session.messages.save({ sessionId: sid, role: 'system', content: data.summary, timestamp: data.timestamp }).catch(() => {});
            return { taskEvents: newEvents, messages: newMessages, taskMsgIds: newIds };
          }
        }
        return { taskEvents: newEvents };
      });
    });
  }, [updateTab]);

  // 监听 CLI 最终输出事件 — 按 sessionId 分发
  useEffect(() => {
    return api.cli.onOutput((data) => {
      const sid = data.sessionId;
      if (data.msgId) {
        // Use a flag to avoid updating in the same tick
        const flag = `${sid}_${data.msgId}`;
        if ((window as Record<string, boolean>)[flag]) return;
        (window as Record<string, boolean>)[flag] = true;
      }

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

      updateTab(sid, (tab) => {
        const newMessages = [...tab.messages.slice(-500), msg];
        if (sid) {
          api.session.messages.save({ sessionId: sid, role: msg.role, content: msg.content, timestamp: msg.timestamp, thinking: msg.thinking, toolSteps: msg.toolSteps, cost: msg.cost, duration: msg.duration, inputTokens: msg.inputTokens, outputTokens: msg.outputTokens, cacheCreationTokens: msg.cacheCreationTokens, cacheReadTokens: msg.cacheReadTokens }).catch(() => {});
        }
        return { messages: newMessages, streamingMsg: null };
      });
    });
  }, [updateTab]);

  // 监听 CLI 进程退出事件 — 按 sessionId 分发
  useEffect(() => {
    return api.cli.onExit((data) => {
      updateTab(data.sessionId, (tab) => ({
        isRunning: false,
        streamingMsg: null,
        messages: [...tab.messages, { role: 'system', content: `进程已退出 (code: ${data.code}, signal: ${data.signal})`, timestamp: Date.now() }],
      }));
    });
  }, [updateTab]);

  // 自动滚动到底部
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMsg]);

  // 打开项目目录选择对话框
  const handleOpenProject = useCallback(async () => {
    const dir = await api.fs.selectDirectory();
    if (dir) setProjectDir(dir);
  }, []);

  // 消息搜索过滤
  const [msgSearch, setMsgSearch] = useState('');
  const filteredMessages = useMemo(() => {
    if (!msgSearch.trim()) return messages;
    const q = msgSearch.toLowerCase();
    return messages.filter(m =>
      m.content.toLowerCase().includes(q) ||
      m.thinking?.toLowerCase().includes(q) ||
      m.toolSteps?.some(s => JSON.stringify(s).toLowerCase().includes(q))
    );
  }, [messages, msgSearch]);

  // 合并过滤后的消息和当前流式消息
  const allMessages = streamingMsg ? [...filteredMessages, streamingMsg] : filteredMessages;

  // Token 和费用汇总
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

  // 侧边栏会话过滤
  const filteredSessions = searchText
    ? sessions.filter(s => s.name.toLowerCase().includes(searchText.toLowerCase()) || s.project_dir.toLowerCase().includes(searchText.toLowerCase()))
    : sessions;

  // 注册全局键盘快捷键
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

  // 监听输入文本变化，自动调整 textarea 高度
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [inputText]);

  // 图片处理 — 读取文件为 data URL
  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setAttachedImages(prev => [...prev, { id, name: file.name, dataUrl }]);
    };
    reader.readAsDataURL(file);
  }, []);

  // 粘贴图片
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) handleImageFile(file);
        break;
      }
    }
  }, [handleImageFile]);

  // 拖拽文件
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        handleImageFile(files[i]);
      }
    }
  }, [handleImageFile]);

  // 从文件选择器选择图片
  const handleSelectImages = useCallback(async () => {
    const paths = await api.fs.selectFiles([
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
    ]);
    for (const p of paths) {
      const dataUrl = await api.fs.readImage(p);
      const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const name = p.split('/').pop() || 'image';
      setAttachedImages(prev => [...prev, { id, name, dataUrl }]);
    }
  }, []);

  // 移除附件图片
  const removeImage = useCallback((id: string) => {
    setAttachedImages(prev => prev.filter(img => img.id !== id));
  }, []);

  // 导出当前会话为 Markdown 文件
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

  // JSX 渲染部分开始
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab 栏 */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 0,
        borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)',
        padding: '0 8px', minHeight: 36, flexShrink: 0, overflowX: 'auto',
      }}>
        {Array.from(tabs.entries()).map(([sid, tab]) => (
          <div
            key={sid}
            onClick={() => { setActiveTabId(sid); setProjectDir(tab.projectDir); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', cursor: 'pointer', fontSize: 12,
              borderBottom: sid === activeTabId ? '2px solid var(--cyan)' : '2px solid transparent',
              background: sid === activeTabId ? 'rgba(0,229,255,0.06)' : 'transparent',
              color: sid === activeTabId ? 'var(--text-primary)' : 'var(--text-dim)',
              maxWidth: 180,
              minWidth: 80,
              borderRadius: '4px 4px 0 0',
              transition: 'background 0.15s',
            }}
          >
            <span className={`status-dot ${tab.isRunning ? 'running' : 'idle'}`} style={{ width: 6, height: 6, flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tab.name}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); handleCloseTab(sid); }}
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'var(--text-dim)', fontSize: 14, lineHeight: 1, padding: '0 2px',
                flexShrink: 0,
              }}
              title="关闭标签"
            >
              ×
            </button>
          </div>
        ))}
        {/* 新建 Tab 按钮 */}
        <button
          onClick={handleStartSession}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--text-dim)', fontSize: 16, padding: '4px 10px',
            lineHeight: 1,
          }}
          title="新建会话标签"
        >
          +
        </button>
      </div>

      {/* 工具栏 */}
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
          <div style={{ width: leftPanelWidth, borderRight: '1px solid var(--border-color)', padding: 8, overflow: 'auto', flexShrink: 0 }}>
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
                  // 更新 Tab 名称
                  setTabs(prev => {
                    const next = new Map(prev);
                    const tab = next.get(sid);
                    if (tab) next.set(sid, { ...tab, name });
                    return next;
                  });
                }}
                onDelete={async (sid) => {
                  handleCloseTab(sid);
                  await api.session.delete(sid);
                  setSessions(prev => prev.filter(s => s.id !== sid));
                }}
              />
            ))
          )}
          </div>
        )}
        {showLeftPanel && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = leftPanelWidth;
              const onMove = (ev: MouseEvent) => {
                const diff = ev.clientX - startX;
                setLeftPanelWidth(Math.max(150, Math.min(400, startWidth + diff)));
              };
              const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
            style={{
              width: 4, cursor: 'col-resize', flexShrink: 0,
              background: 'transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cyan)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          />
        )}

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
              {loadingMessages ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 0' }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      animation: 'pulse 1.5s ease-in-out infinite',
                      animationDelay: `${i * 0.2}s`,
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--border-color)', flexShrink: 0,
                      }} />
                      <div style={{ flex: 1 }}>
                        <div style={{
                          height: 14, borderRadius: 4,
                          background: 'var(--border-color)', width: '60%', marginBottom: 8,
                        }} />
                        <div style={{
                          height: 12, borderRadius: 4,
                          background: 'var(--border-color)', width: '90%', marginBottom: 6,
                        }} />
                        <div style={{
                          height: 12, borderRadius: 4,
                          background: 'var(--border-color)', width: '75%',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : allMessages.length === 0 ? (
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

          {/* TemplatePicker */}
          <TemplatePicker onInsert={(text) => setInputText(prev => prev ? prev + '\n' + text : text)} />

          {/* 快捷命令栏 */}
          <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {QUICK_COMMANDS.map((cmd, i) => (
              <button key={i} onClick={() => setInputText(prev => prev ? prev + '\n' + cmd.text : cmd.text)}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 11, padding: '2px 8px', color: 'var(--cyan)' }}>
                {cmd.label}
              </button>
            ))}
          </div>

          {/* 图片预览 */}
          {attachedImages.length > 0 && (
            <ImagePreview images={attachedImages} onRemove={removeImage} />
          )}

          {/* 输入框（支持拖拽和粘贴图片） */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onPaste={handlePaste}
            style={{
              display: 'flex', gap: 8, padding: '12px 16px',
              borderTop: '1px solid var(--border-color)', background: 'var(--bg-card)', flexShrink: 0,
              border: isDragOver ? '2px dashed var(--cyan)' : '2px solid transparent',
              borderRadius: 6, margin: '0 4px 4px',
              transition: 'border 0.15s',
            }}
          >
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleSelectImages}
              style={{ fontSize: 14, padding: '4px 8px', flexShrink: 0, alignSelf: 'flex-end' }}
              title="插入图片"
            >
              🖼
            </button>
            <textarea
              ref={inputRef}
              className="input"
              placeholder={isRunning ? '输入消息... (Enter 发送, Shift+Enter 换行, 粘贴/拖拽图片)' : '请先启动会话'}
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
        <div style={{ width: 240, borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          {/* 右侧面板标签 */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
            {(['context', 'tools', 'files'] as const).map(tab => (
              <button key={tab} onClick={() => setRightPanelTab(tab)}
                style={{
                  flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: rightPanelTab === tab ? 'rgba(0,229,255,0.08)' : 'transparent',
                  color: rightPanelTab === tab ? 'var(--cyan)' : 'var(--text-dim)',
                  border: 'none', borderBottom: rightPanelTab === tab ? '2px solid var(--cyan)' : '2px solid transparent',
                }}>
                {tab === 'context' ? '上下文' : tab === 'tools' ? '工具' : '文件'}
              </button>
            ))}
          </div>

          {rightPanelTab === 'tools' ? (
            <div style={{ flex: 1, overflow: 'hidden' }}><ToolsPanel /></div>
          ) : rightPanelTab === 'files' ? (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {projectDir ? <FileExplorer dirPath={projectDir} /> : (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>请先选择项目目录</div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              <>
                {/* 费用预算 */}
                {sessionId && (
                  <div style={{ marginBottom: 16, padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>费用预算</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}>
                      <div>已用: <span style={{ color: currentCost >= (budgetLimit ?? Infinity) ? 'var(--danger)' : 'var(--cyan)', fontWeight: 600 }}>${currentCost.toFixed(4)}</span></div>
                      {budgetLimit !== null && <div>限额: <span style={{ color: 'var(--text-primary)' }}>${budgetLimit.toFixed(2)}</span></div>}
                    </div>
                    <input className="input" type="number" step="0.1" min="0" placeholder="设置预算上限 ($)"
                      value={budgetLimit ?? ''}
                      onChange={(e) => { const v = e.target.value ? parseFloat(e.target.value) : null; setBudgetLimit(v); }}
                      onBlur={() => { if (sessionId) api.session.setBudget({ sessionId, budgetLimit }).catch(() => {}); }}
                      style={{ fontSize: 11, padding: '2px 6px', marginTop: 6 }} />
                  </div>
                )}

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
            </div>
          )}
        </div>
        )}
      </div>

      {/* 内嵌终端 */}
      <EmbeddedTerminal sessionId={sessionId} visible={showTerminal} height={terminalHeight} onHeightChange={setTerminalHeight} />

      {/* 底部状态栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '4px 16px',
        borderTop: showTerminal ? 'none' : '1px solid var(--border-color)', background: 'var(--bg-card)',
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
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => setShowTerminal(!showTerminal)} style={{ fontSize: 10, padding: '2px 6px', color: showTerminal ? 'var(--cyan)' : 'var(--text-dim)' }}>
          {showTerminal ? '隐藏终端' : '显示终端'}
        </button>
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
