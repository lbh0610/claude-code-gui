import { spawn, ChildProcess } from 'node:child_process';
import { BrowserWindow } from 'electron';
import { getCliPath } from '../config';

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
      env.ANTHROPIC_API_KEY = config.apiKey;
    }
    if (config.proxy && typeof config.proxy === 'string') {
      env.HTTPS_PROXY = config.proxy;
      env.HTTP_PROXY = config.proxy;
    }
    if (config.envVariables && typeof config.envVariables === 'object') {
      Object.assign(env, config.envVariables);
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

    /** 发送当前累积的流式更新 */
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
            // 最终结果：发送完整消息（带唯一 msgId 去重）
            messageCounter++;
            sendToRenderer('cli-output', {
              sessionId,
              type: 'stdout' as const,
              text: assistantTurnText,
              thinking: assistantTurnThinking || undefined,
              toolSteps: toolSteps.length > 0 ? toolSteps : undefined,
              role: 'assistant' as const,
              msgId: `${sessionId}_a_${messageCounter}`,
            });
            assistantTurnText = '';
            assistantTurnThinking = '';
            toolSteps = [];
          }
        } catch {
          // 非 JSON 行，原样发送
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
      sessions.delete(sessionId);
      sendToRenderer('cli-exit', {
        sessionId,
        code: code ?? -1,
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
    return { ok: false, pid: null, msg: `启动失败: ${msg}` };
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
  ipcMain.handle('cli:start', (_, { sessionId, projectDir, config }) =>
    startSession(sessionId, projectDir, config)
  );
  ipcMain.handle('cli:stop', (_, sessionId: string) => stopSession(sessionId));
  ipcMain.handle('cli:input', (_, { sessionId, input }) => sendInput(sessionId, input));
  ipcMain.handle('cli:status', () => getStatus());
}
