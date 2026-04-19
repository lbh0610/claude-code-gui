// 引入子进程模块，用于生成 CLI 子进程
import { spawn, ChildProcess } from 'node:child_process';
// 引入 Electron 渲染窗口类，用于向渲染层发送事件
import { BrowserWindow } from 'electron';
// 引入 CLI 路径获取函数
import { getCliPath } from '../config';
// 引入日志记录函数
import { addLog } from './log-manager';
// 引入配置解密函数
import { decryptValue } from './config-manager';

/**
 * CLI 子进程接口定义
 */
interface Session {
  id: string;               // 会话唯一标识
  process: ChildProcess | null;  // CLI 子进程实例
  projectDir: string;       // 项目工作目录
}

// 存储所有活跃会话的 Map
const sessions = new Map<string, Session>();
// 主窗口引用，用于向渲染层发送消息
let mainWindow: BrowserWindow | null = null;
// 消息计数器，用于生成唯一消息 ID
let messageCounter = 0;

/**
 * 向渲染层发送消息
 * @param channel - 消息通道名称
 * @param data - 要发送的数据
 */
function sendToRenderer(channel: string, data: unknown): void {
  // 检查窗口是否仍然存在且未被销毁
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * 设置主窗口引用，供 sendToRenderer 使用
 * @param window - Electron 主窗口实例
 */
export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window;
}

/**
 * 启动 CLI 子进程
 * 使用 stream-json 格式通过 stdin/stdout 管道通信
 * @param sessionId - 会话 ID
 * @param projectDir - 项目工作目录
 * @param config - 配置对象（含 API Key、代理、模型等）
 * @returns 启动结果
 */
export async function startSession(
  sessionId: string,
  projectDir: string,
  config: Record<string, unknown>
): Promise<{ ok: boolean; pid: number | null; msg?: string }> {
  // 如果会话已存在且进程在运行，先停止
  const existing = sessions.get(sessionId);
  if (existing?.process) {
    stopSession(sessionId);
  }

  // 获取 CLI 可执行文件路径
  const cliPath = getCliPath(config.cliPath as string);

  // 创建会话对象
  const session: Session = {
    id: sessionId,
    process: null,
    projectDir,
  };

  try {
    // 继承当前进程的环境变量
    const env = { ...process.env };

    // 处理 API Key：解密后注入到环境变量
    if (config.apiKey && typeof config.apiKey === 'string') {
      const keyRaw = decryptValue(config.apiKey as string);
      // 长度校验防止过大值
      if (keyRaw && keyRaw.length < 10000) {
        env.ANTHROPIC_API_KEY = keyRaw;
      }
    }
    // 处理企业网关地址
    if (config.gatewayUrl && typeof config.gatewayUrl === 'string') {
      env.ANTHROPIC_BASE_URL = config.gatewayUrl as string;
    }
    // 处理代理设置
    if (config.proxy && typeof config.proxy === 'string') {
      env.HTTPS_PROXY = config.proxy;
      env.HTTP_PROXY = config.proxy;
    }
    // 处理自定义环境变量（键值对形式）
    if (config.envVariables && typeof config.envVariables === 'object' && !Array.isArray(config.envVariables)) {
      for (const [key, val] of Object.entries(config.envVariables as Record<string, unknown>)) {
        // 长度限制防止 E2BIG 错误
        if (typeof val === 'string' && val.length < 16384) {
          env[key] = val;
        }
      }
    }
    // 处理系统提示词
    if (config.systemPrompt && typeof config.systemPrompt === 'string' && config.enableSystemPrompt !== false) {
      // 截断到 4096 字符
      const prompt = config.systemPrompt.slice(0, 4096);
      if (prompt) env.CLAUDE_CODE_SYSTEM_PROMPT = prompt;
    }

    // 构建 CLI 参数列表
    const args: string[] = [
      '-p',                          // 持久模式
      '--verbose',                   // 详细输出
      '--input-format', 'stream-json',   // JSON 流式输入格式
      '--output-format', 'stream-json',  // JSON 流式输出格式
    ];
    // 如果指定了模型则追加参数
    if (config.model && typeof config.model === 'string') {
      args.push('--model', config.model);
    }
    // 跳过权限确认提示
    args.push('--dangerously-skip-permissions');

    console.log(`[CLI] 启动命令: ${cliPath} ${args.join(' ')}`);
    console.log(`[CLI] 工作目录: ${projectDir}`);

    // 生成 CLI 子进程
    const child = spawn(cliPath, args, {
      cwd: projectDir,      // 设置工作目录
      env,                  // 注入环境变量
      stdio: ['pipe', 'pipe', 'pipe'],  // stdin/stdout/stderr 全部管道化
      shell: false,         // 不使用 shell
    });

    // 保存进程引用
    session.process = child;
    sessions.set(sessionId, session);

    // 通知渲染层进程已启动
    sendToRenderer('cli-status', { status: 'running', pid: child.pid });

    // 用于流式解析的缓冲区
    let buffer = '';
    // 当前 AI 轮次的文本累积
    let assistantTurnText = '';
    // 当前 AI 轮次的思考内容累积
    let assistantTurnThinking = '';
    // 工具调用步骤列表
    let toolSteps: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] = [];

    /** 发送当前累积的流式更新到渲染层 */
    function sendStreamingUpdate() {
      sendToRenderer('cli-stream', {
        sessionId,
        thinking: assistantTurnThinking || undefined,
        text: assistantTurnText || undefined,
        toolSteps: toolSteps.length > 0 ? toolSteps : undefined,
      });
    }

    // 监听标准输出
    child.stdout?.on('data', (data: Buffer) => {
      // 追加到缓冲区
      buffer += data.toString('utf-8');
      // 按换行分割，最后一行可能不完整则保留
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      // 逐行解析
      for (const line of lines) {
        // 跳过空行
        if (!line.trim()) continue;
        try {
          // 尝试解析 JSON
          const msg = JSON.parse(line);

          // 推送任务事件到渲染层（实时事件流）
          sendToRenderer('cli-task', {
            sessionId,
            type: msg.type || 'unknown',
            subtype: msg.subtype || '',
            timestamp: Date.now(),
            summary: summarizeTaskEvent(msg),
            raw: JSON.stringify(msg).slice(0, 2000),
          });

          // 处理 AI 消息内容
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const part of msg.message.content) {
              if (part.type === 'text') {
                // 累积文本内容
                assistantTurnText += part.text;
              } else if (part.type === 'thinking') {
                // 累积思考内容并立即推送
                assistantTurnThinking += part.thinking || '';
                sendStreamingUpdate();
              } else if (part.type === 'tool_use') {
                // 记录工具调用
                const toolName = part.name || part.tool_name || 'unknown';
                const toolInput = part.input || {};
                toolSteps.push({ name: toolName, input: toolInput, status: 'running' });
                sendStreamingUpdate();
              } else if (part.type === 'tool_result') {
                // 记录工具结果
                const lastStep = toolSteps[toolSteps.length - 1];
                if (lastStep) {
                  lastStep.status = 'done';
                  lastStep.output = typeof part.content === 'string' ? part.content.slice(0, 500) : '';
                  sendStreamingUpdate();
                }
              }
            }
          }
          // 处理执行完成事件
          if (msg.type === 'result') {
            const usage = msg.usage as Record<string, unknown> | undefined;
            messageCounter++;
            sendToRenderer('cli-output', {
              sessionId,
              type: 'stdout' as const,
              text: assistantTurnText,
              thinking: assistantTurnThinking || undefined,
              toolSteps: toolSteps.length > 0 ? toolSteps : undefined,
              role: 'assistant' as const,
              msgId: `${sessionId}_a_${messageCounter}`,
              cost: msg.total_cost_usd ?? 0,
              duration: msg.duration_ms ?? 0,
              inputTokens: usage ? (usage.input_tokens as number | undefined) ?? 0 : 0,
              outputTokens: usage ? (usage.output_tokens as number | undefined) ?? 0 : 0,
              cacheCreationTokens: usage ? (usage.cache_creation_input_tokens as number | undefined) ?? 0 : 0,
              cacheReadTokens: usage ? (usage.cache_read_input_tokens as number | undefined) ?? 0 : 0,
            });
            // 清空累积数据，为下一轮做准备
            assistantTurnText = '';
            assistantTurnThinking = '';
            toolSteps = [];
          }
        } catch {
          // 非 JSON 行，作为系统消息推送
          messageCounter++;
          sendToRenderer('cli-output', { sessionId, type: 'stdout' as const, text: line + '\n', role: 'system' as const, msgId: `${sessionId}_s_${messageCounter}` });
        }
      }
    });

    // 监听标准错误
    child.stderr?.on('data', (data: Buffer) => {
      sendToRenderer('cli-output', {
        sessionId,
        type: 'stderr' as const,
        text: data.toString('utf-8'),
        role: 'system' as const,
        msgId: `stderr_${sessionId}_${Date.now()}`,
      });
    });

    // 监听进程退出
    child.on('exit', (code, signal) => {
      const exitCode = code ?? -1;
      // 从会话列表中移除
      sessions.delete(sessionId);
      addLog('cli', exitCode === 0 ? 'info' : 'warn', 'session_exited', `会话 ${sessionId} 退出 (code: ${exitCode}, signal: ${signal ?? 'unknown'})`, sessionId);
      sendToRenderer('cli-exit', {
        sessionId,
        code: exitCode,
        signal: signal ?? 'unknown',
      });
      sendToRenderer('cli-status', { status: 'stopped', pid: null });
    });

    // 监听进程错误
    child.on('error', (err) => {
      messageCounter++;
      sendToRenderer('cli-output', {
        sessionId,
        type: 'stderr' as const,
        text: `[CLI Error] ${err.message}\n`,
        msgId: `${sessionId}_${messageCounter}`,
      });
      sessions.delete(sessionId);
      sendToRenderer('cli-status', { status: 'error', pid: null });
    });

    return { ok: true, pid: child.pid ?? null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // 特殊处理环境变量过大的错误
    const detail = (err as { code?: string })?.code === 'E2BIG'
      ? `启动失败: 环境变量过大 (E2BIG)。请检查系统提示词长度或自定义环境变量。${msg}`
      : `启动失败: ${msg}`;
    return { ok: false, pid: null, msg: detail };
  }
}

/**
 * 将 JSON 事件摘要转为可读的任务描述
 * @param msg - 解析后的 JSON 事件对象
 * @returns 可读的事件描述字符串
 */
function summarizeTaskEvent(msg: Record<string, unknown>): string {
  switch (msg.type) {
    case 'system':
      if (msg.subtype === 'init') return `会话已初始化 (session_id: ${String(msg.session_id || '').slice(0, 8)})`;
      return `系统事件: ${String(msg.subtype || '')}`;
    case 'assistant': {
      const content = msg.message as Record<string, unknown> | undefined;
      if (content?.content && Array.isArray(content.content)) {
        const types = content.content.map((c: Record<string, unknown>) => String(c.type || '')).join(', ');
        return `AI 回复: [${types}]`;
      }
      return 'AI 消息';
    }
    case 'result':
      return `执行完成 (耗时: ${String(msg.duration_ms || '')}ms, 费用: $${String(msg.total_cost_usd || '0')})`;
    case 'user':
      return '用户输入';
    default:
      return `${String(msg.type || 'unknown')} 事件`;
  }
}

/**
 * 停止 CLI 子进程，先尝试 SIGTERM，3 秒后未退出则 SIGKILL
 * @param sessionId - 会话 ID
 */
export function stopSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session?.process) {
    // 发送优雅终止信号
    session.process.kill('SIGTERM');
    // 3 秒后检查是否仍在运行，如果是则强制杀掉
    setTimeout(() => {
      if (sessions.has(sessionId)) {
        session.process?.kill('SIGKILL');
      }
    }, 3000);
    sessions.delete(sessionId);
  }
}

/**
 * 向 CLI 子进程 stdin 写入用户输入（stream-json 格式）
 * @param sessionId - 会话 ID
 * @param input - 用户输入的文本
 */
export function sendInput(sessionId: string, input: string): void {
  const session = sessions.get(sessionId);
  // 检查进程 stdin 是否可用
  if (session?.process?.stdin) {
    session.process.stdin.write(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: input },
    }) + '\n');
  }
}

/**
 * 查询当前 CLI 会话状态
 * @returns 包含状态、PID 和会话数量的对象
 */
export function getStatus(): { status: string; pid: number | null; sessionCount: number } {
  // 获取第一个活跃会话
  const first = sessions.values().next();
  if (!first.done && first.value.process) {
    return {
      status: 'running',
      pid: first.value.process.pid ?? null,
      sessionCount: sessions.size,
    };
  }
  return { status: 'idle', pid: null, sessionCount: sessions.size };
}

/**
 * 注册所有 CLI 相关的 IPC 处理函数
 * @param ipcMain - Electron 主进程 IPC 实例
 */
export function registerCliHandlers(ipcMain: Electron.IpcMain): void {
  // 启动会话
  ipcMain.handle('cli:start', async (_, { sessionId, projectDir, config }) => {
    const result = await startSession(sessionId, projectDir, config);
    if (result.ok) {
      addLog('cli', 'info', 'session_started', `会话 ${sessionId} 已启动 (PID: ${result.pid})`, sessionId);
    } else {
      addLog('cli', 'error', 'session_start_failed', `会话 ${sessionId} 启动失败: ${result.msg}`, sessionId);
    }
    return result;
  });
  // 停止会话
  ipcMain.handle('cli:stop', (_, sessionId: string) => {
    stopSession(sessionId);
    addLog('cli', 'info', 'session_stopped', `会话 ${sessionId} 已停止`, sessionId);
  });
  // 发送输入
  ipcMain.handle('cli:input', (_, { sessionId, input }) => {
    sendInput(sessionId, input);
    addLog('cli', 'info', 'input_sent', `向会话 ${sessionId} 发送输入`, sessionId);
  });
  // 查询状态
  ipcMain.handle('cli:status', () => getStatus());
}
