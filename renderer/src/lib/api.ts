/**
 * IPC 调用封装 + 类型声明
 * 渲染进程通过 window.electronAPI 调用主进程功能
 */

// ElectronAPI 类型声明（实际由 preload.ts 的 contextBridge 暴露）
export interface ElectronAPI {
  config: {
    get: () => Promise<Record<string, unknown>>;
    save: (config: Record<string, unknown>) => Promise<void>;
    testConnection: (config: Record<string, unknown>) => Promise<{ ok: boolean; msg: string }>;
  };
  cli: {
    start: (sessionId: string, projectDir: string, config: Record<string, unknown>) => Promise<{ ok: boolean; pid: number | null; msg?: string }>;
    stop: (sessionId: string) => Promise<void>;
    input: (sessionId: string, input: string) => Promise<void>;
    status: () => Promise<{ status: string; pid: number | null; sessionCount: number }>;
    onOutput: (cb: (data: { sessionId: string; type: 'stdout' | 'stderr'; text: string; thinking?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[]; role?: 'user' | 'assistant' | 'system'; msgId?: string; cost?: number; duration?: number; inputTokens?: number; outputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number }) => void) => () => void;
    onStream: (cb: (data: { sessionId: string; thinking?: string; text?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] }) => void) => () => void;
    onTask: (cb: (data: { sessionId: string; type: string; subtype: string; timestamp: number; summary: string; raw: string }) => void) => () => void;
    onExit: (cb: (data: { sessionId: string; code: number; signal: string }) => void) => () => void;
    onStatus: (cb: (data: { status: string; pid: number | null }) => void) => () => void;
  };
  session: {
    list: (projectId?: string) => Promise<unknown[]>;
    create: (data: { projectId?: string; projectDir: string; name: string }) => Promise<unknown>;
    delete: (sessionId: string) => Promise<void>;
    rename: (sessionId: string, name: string) => Promise<void>;
    messages: {
      save: (data: { sessionId: string; role: string; content: string; timestamp: number; thinking?: string; toolSteps?: unknown[]; cost?: number; duration?: number; inputTokens?: number; outputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number }) => Promise<void>;
      load: (sessionId: string) => Promise<unknown[]>;
    };
  };
  log: {
    list: (filter?: Record<string, unknown>) => Promise<unknown[]>;
    export: (filePath: string, format: string) => Promise<void>;
    diagnostic: (filePath: string) => Promise<void>;
    delete: (id: number) => Promise<void>;
    clear: () => Promise<void>;
  };
  plugin: {
    list: () => Promise<unknown[]>;
    toggle: (id: string, enabled: boolean) => Promise<void>;
  };
  update: {
    check: () => Promise<unknown>;
    importPatch: (filePath: string) => Promise<{ ok: boolean; msg: string }>;
    info: () => Promise<unknown>;
  };
  skill: {
    list: () => Promise<{ id: string; name: string; description: string; enabled: boolean }[]>;
    get: (id: string) => Promise<{ id: string; name: string; description: string; content: string; subdirs: string[]; enabled: boolean } | null>;
    create: (data: { name: string; description: string; content: string }) => Promise<{ ok: boolean; id: string; msg?: string }>;
    update: (data: { id: string; name: string; description: string; content: string }) => Promise<{ ok: boolean; msg?: string }>;
    delete: (id: string) => Promise<{ ok: boolean; msg?: string }>;
    toggle: (id: string, enabled: boolean) => Promise<void>;
  };
  fs: {
    selectDirectory: () => Promise<string | null>;
    readFile: (filePath: string) => Promise<string>;
  };
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<unknown>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// 浏览器开发模式下的 mock API（Electron 环境中由 preload.ts 的 contextBridge 提供真实实现）
function getApi(): ElectronAPI {
  if (window.electronAPI) return window.electronAPI;

  return {
    config: {
      get: () => Promise.resolve({}),
      save: () => Promise.resolve(),
      testConnection: () => Promise.resolve({ ok: true, msg: 'mock' }),
    },
    cli: {
      start: () => Promise.resolve({ ok: true, pid: null, msg: 'mock: 仅在 Electron 环境中可用' }),
      stop: () => Promise.resolve(),
      input: () => Promise.resolve(),
      status: () => Promise.resolve({ status: 'idle', pid: null, sessionCount: 0 }),
      onOutput: () => () => {},
      onExit: () => () => {},
      onStatus: () => () => {},
    },
    session: {
      list: () => Promise.resolve([]),
      create: () => Promise.resolve({ id: 'mock-session', name: '新会话' }),
      delete: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      messages: {
        save: () => Promise.resolve(),
        load: () => Promise.resolve([]),
      },
    },
    log: {
      list: () => Promise.resolve([]),
      export: () => Promise.resolve(),
      diagnostic: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    plugin: {
      list: () => Promise.resolve([]),
      toggle: () => Promise.resolve(),
    },
    update: {
      check: () => Promise.resolve({ available: false, latestVersion: '0.1.0', releaseNotes: '' }),
      importPatch: () => Promise.resolve({ ok: false, msg: 'mock' }),
      info: () => Promise.resolve({ currentVersion: '0.1.0', appName: 'Agent Workbench', platform: 'mock', arch: 'arm64' }),
    },
    skill: {
      list: () => Promise.resolve([]),
      get: () => Promise.resolve(null),
      create: () => Promise.resolve({ ok: false, msg: 'mock' }),
      update: () => Promise.resolve({ ok: false, msg: 'mock' }),
      delete: () => Promise.resolve({ ok: false, msg: 'mock' }),
      toggle: () => Promise.resolve(),
    },
    fs: {
      selectDirectory: () => Promise.resolve(null),
      readFile: () => Promise.resolve(''),
    },
    app: {
      getVersion: () => Promise.resolve('0.1.0'),
      getPlatform: () => Promise.resolve('mock'),
    },
  };
}

export const api = getApi();
