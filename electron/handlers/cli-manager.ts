import { spawn, ChildProcess } from 'node:child_process';
import { BrowserWindow } from 'electron';
import { getCliPath } from '../config';
import { addLog } from './log-manager';
import { decryptValue } from './config-manager';

/**
 * CLI 进程管理器
 * 使用 claude -p --verbose --input-format=stream-json --output-format=stream-json
 * 通过 stdin/stdout 管道通信，跳过 workspace trust 对话框
 */

interface Session {
  id: string;
  process: ChildProcess | null;
  projectDir: string;
}

const sessions = new Map<string, Session>();
let mainWindow: BrowserWindow | null = null;
let messageCounter = 0;

function sendToRenderer(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window;
}

/**
 * 启动 CLI 子进程
 */
export async function startSession(
  sessionId: string,
  projectDir: string,
  config: Record<string, unknown>
): Promise<{ ok: boolean; pid: number | null; msg?: string }> {
  const existing = sessions.get(sessionId);
  if (existing?.process) {
    stopSession(sessionId);
  }

  const cliPath = getCliPath(config.cliPath as string);

  const session: Session = {
    id: sessionId,
    process: null,
    projectDir,
  };

  try {
    const env = { ...process.env };

    if (config.apiKey && typeof config.apiKey === 'string') {
      const keyRaw = decryptValue(config.apiKey as string);
      if (keyRaw && keyRaw.length < 10000) {
        env.ANTHROPIC_API_KEY = keyRaw;
      }
    }
    if (config.gatewayUrl && typeof config.gatewayUrl === 'string') {
      env.ANTHROPIC_BASE_URL = config.gatewayUrl as string;
    }
    if (config.proxy && typeof config.proxy === 'string') {
      env.HTTPS_PROXY = config.proxy;
      env.HTTP_PROXY = config.proxy;
    }
    if (config.envVariables && typeof config.envVariables === 'object' && !Array.isArray(config.envVariables)) {
      for (const [key, val] of Object.entries(config.envVariables as Record<string, unknown>)) {
        if (typeof val === 'string' && val.length < 16384) {
          env[key] = val;
        }
      }
    }
    if (config.systemPrompt && typeof config.systemPrompt === 'string' && config.enableSystemPrompt !== false) {
      const prompt = config.systemPrompt.slice(0, 4096);
      if (prompt) env.CLAUDE_CODE_SYSTEM_PROMPT = prompt;
    }

    const args: string[] = [
      '-p',
      '--verbose',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
    ];
    if (config.model && typeof config.model === 'string') {
      args.push('--model', config.model);
    }
    args.push('--dangerously-skip-permissions');

    console.log(`[CLI] 启动命令: ${cliPath} ${args.join(' ')}`);
    console.log(`[CLI] 工作目录: ${projectDir}`);

    const child = spawn(cliPath, args, {
      cwd: projectDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    session.process = child;
    sessions.set(sessionId, session);

    sendToRenderer('cli-status', { status: 'running', pid: child.pid });

    // 流式解析 stdout
    let buffer = '';
    let assistantTurnText = '';
    let assistantTurnThinking = '';
    let toolSteps: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] = [];

    /** 发送当前累积的流式更新（仅聊天气泡） */
    function sendStreamingUpdate() {
      sendToRenderer('cli-stream', {
        sessionId,
        thinking: assistantTurnThinking || undefined,
        text: assistantTurnText || undefined,
        toolSteps: toolSteps.length > 0 ? toolSteps : undefined,
      });
    }

    child.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);

          // ====== 任务事件：实时推送所有解析到的事件 ======
          sendToRenderer('cli-task', {
            sessionId,
            type: msg.type || 'unknown',
            subtype: msg.subtype || '',
            timestamp: Date.now(),
            summary: summarizeTaskEvent(msg),
            raw: JSON.stringify(msg).slice(0, 2000),
          });
          // =================================================

          if (msg.type === 'assistant' && msg.message?.content) {
            for (const part of msg.message.content) {
              if (part.type === 'text') {
                assistantTurnText += part.text;
              } else if (part.type === 'thinking') {
                assistantTurnThinking += part.thinking || '';
                // 流式推送思考过程
                sendStreamingUpdate();
              } else if (part.type === 'tool_use') {
                const toolName = part.name || part.tool_name || 'unknown';
                const toolInput = part.input || {};
                toolSteps.push({ name: toolName, input: toolInput, status: 'running' });
                // 流式推送工具调用
                sendStreamingUpdate();
              } else if (part.type === 'tool_result') {
                const lastStep = toolSteps[toolSteps.length - 1];
                if (lastStep) {
                  lastStep.status = 'done';
                  lastStep.output = typeof part.content === 'string' ? part.content.slice(0, 500) : '';
                  // 流式推送工具结果
                  sendStreamingUpdate();
                }
              }
            }
          }
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
            assistantTurnText = '';
            assistantTurnThinking = '';
            toolSteps = [];
          }
        } catch {
          // 非 JSON 行，同时推送到任务流和输出流
          messageCounter++;
          sendToRenderer('cli-output', { sessionId, type: 'stdout' as const, text: line + '\n', role: 'system' as const, msgId: `${sessionId}_s_${messageCounter}` });
        }
      }
    });

    // 捕获 stderr
    child.stderr?.on('data', (data: Buffer) => {
      sendToRenderer('cli-output', {
        sessionId,
        type: 'stderr' as const,
        text: data.toString('utf-8'),
        role: 'system' as const,
        msgId: `stderr_${sessionId}_${Date.now()}`,
      });
    });

    child.on('exit', (code, signal) => {
      const exitCode = code ?? -1;
      sessions.delete(sessionId);
      addLog('cli', exitCode === 0 ? 'info' : 'warn', 'session_exited', `会话 ${sessionId} 退出 (code: ${exitCode}, signal: ${signal ?? 'unknown'})`, sessionId);
      sendToRenderer('cli-exit', {
        sessionId,
        code: exitCode,
        signal: signal ?? 'unknown',
      });
      sendToRenderer('cli-status', { status: 'stopped', pid: null });
    });

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
    const detail = (err as { code?: string })?.code === 'E2BIG'
      ? `启动失败: 环境变量过大 (E2BIG)。请检查系统提示词长度或自定义环境变量。${msg}`
      : `启动失败: ${msg}`;
    return { ok: false, pid: null, msg: detail };
  }
}

/**
 * 摘要：将 JSON 事件转为可读的任务描述
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
 * 停止 CLI 子进程
 */
export function stopSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session?.process) {
    session.process.kill('SIGTERM');
    setTimeout(() => {
      if (sessions.has(sessionId)) {
        session.process?.kill('SIGKILL');
      }
    }, 3000);
    sessions.delete(sessionId);
  }
}

/**
 * 向 stdin 写入 JSON 消息（stream-json 格式）
 */
export function sendInput(sessionId: string, input: string): void {
  const session = sessions.get(sessionId);
  if (session?.process?.stdin) {
    session.process.stdin.write(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: input },
    }) + '\n');
  }
}

/**
 * 查询当前会话状态
 */
export function getStatus(): { status: string; pid: number | null; sessionCount: number } {
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

export function registerCliHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('cli:start', async (_, { sessionId, projectDir, config }) => {
    const result = await startSession(sessionId, projectDir, config);
    if (result.ok) {
      addLog('cli', 'info', 'session_started', `会话 ${sessionId} 已启动 (PID: ${result.pid})`, sessionId);
    } else {
      addLog('cli', 'error', 'session_start_failed', `会话 ${sessionId} 启动失败: ${result.msg}`, sessionId);
    }
    return result;
  });
  ipcMain.handle('cli:stop', (_, sessionId: string) => {
    stopSession(sessionId);
    addLog('cli', 'info', 'session_stopped', `会话 ${sessionId} 已停止`, sessionId);
  });
  ipcMain.handle('cli:input', (_, { sessionId, input }) => {
    sendInput(sessionId, input);
    addLog('cli', 'info', 'input_sent', `向会话 ${sessionId} 发送输入`, sessionId);
  });
  ipcMain.handle('cli:status', () => getStatus());
}
