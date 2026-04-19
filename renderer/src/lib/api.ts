// 声明 ElectronAPI 接口类型，定义所有 IPC 调用的签名
export interface ElectronAPI {
  // 配置管理：获取、保存、测试连接、导入导出
  config: {
    get: () => Promise<Record<string, unknown>>;
    save: (config: Record<string, unknown>) => Promise<void>;
    testConnection: (config: Record<string, unknown>) => Promise<{ ok: boolean; msg: string }>;
    export: () => Promise<Record<string, unknown>>;
    import: (filePath: string) => Promise<{ ok: boolean; msg: string }>;
    importFromClaude: () => Promise<{ ok: boolean; msg: string }>;
  };
  // CLI 引擎：启动、停止、输入、状态、事件监听
  cli: {
    start: (sessionId: string, projectDir: string, config: Record<string, unknown>) => Promise<{ ok: boolean; pid: number | null; msg?: string }>;
    stop: (sessionId: string) => Promise<void>;
    input: (sessionId: string, input: string) => Promise<void>;
    status: () => Promise<{ status: string; pid: number | null; sessionCount: number }>;
    detect: () => Promise<{ found: boolean; path: string | null }>;
    install: (useNpx: boolean) => Promise<{ ok: boolean; path?: string; error?: string; mode?: string }>;
    onInstallProgress: (cb: (msg: string) => void) => () => void;
    // 输出事件监听回调注册器，返回取消订阅函数
    onOutput: (cb: (data: { sessionId: string; type: 'stdout' | 'stderr'; text: string; thinking?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[]; role?: 'user' | 'assistant' | 'system'; msgId?: string; cost?: number; duration?: number; inputTokens?: number; outputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number }) => void) => () => void;
    // 流式更新事件监听
    onStream: (cb: (data: { sessionId: string; thinking?: string; text?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] }) => void) => () => void;
    // 任务事件监听
    onTask: (cb: (data: { sessionId: string; type: string; subtype: string; timestamp: number; summary: string; raw: string }) => void) => () => void;
    // 进程退出事件监听
    onExit: (cb: (data: { sessionId: string; code: number; signal: string }) => void) => () => void;
    // 进程状态变化事件监听
    onStatus: (cb: (data: { status: string; pid: number | null }) => void) => () => void;
  };
  // 会话管理：列表、创建、删除、重命名、标签、消息操作
  session: {
    list: (projectId?: string, tag?: string) => Promise<unknown[]>;
    create: (data: { projectId?: string; projectDir: string; name: string }) => Promise<unknown>;
    delete: (sessionId: string) => Promise<void>;
    rename: (sessionId: string, name: string) => Promise<void>;
    autoTitle: (data: { sessionId: string; title: string }) => Promise<void>;
    updateTags: (data: { sessionId: string; tags: string[] }) => Promise<void>;
    messages: {
      save: (data: { sessionId: string; role: string; content: string; timestamp: number; thinking?: string; toolSteps?: unknown[]; cost?: number; duration?: number; inputTokens?: number; outputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number }) => Promise<void>;
      load: (sessionId: string) => Promise<unknown[]>;
      delete: (sessionId: string, messageId: number) => Promise<void>;
    };
  };
  // 日志管理：查询、导出、诊断、删除
  log: {
    list: (filter?: Record<string, unknown>) => Promise<unknown[]>;
    export: (filePath: string, format: string) => Promise<void>;
    diagnostic: (filePath: string) => Promise<void>;
    delete: (id: number) => Promise<void>;
    clear: () => Promise<void>;
  };
  // 插件管理：列表、切换状态
  plugin: {
    list: () => Promise<unknown[]>;
    toggle: (id: string, enabled: boolean) => Promise<void>;
  };
  // 更新管理：检查、导入补丁、版本信息
  update: {
    check: () => Promise<unknown>;
    importPatch: (filePath: string) => Promise<{ ok: boolean; msg: string }>;
    info: () => Promise<unknown>;
  };
  // Skill 管理：列表、获取、创建、更新、删除、切换
  skill: {
    list: () => Promise<{ id: string; name: string; description: string; enabled: boolean }[]>;
    get: (id: string) => Promise<{ id: string; name: string; description: string; content: string; subdirs: string[]; enabled: boolean } | null>;
    create: (data: { name: string; description: string; content: string }) => Promise<{ ok: boolean; id: string; msg?: string }>;
    update: (data: { id: string; name: string; description: string; content: string }) => Promise<{ ok: boolean; msg?: string }>;
    delete: (id: string) => Promise<{ ok: boolean; msg?: string }>;
    toggle: (id: string, enabled: boolean) => Promise<void>;
  };
  // 文件系统：选择目录、读取文件
  fs: {
    selectDirectory: () => Promise<string | null>;
    readFile: (filePath: string) => Promise<string>;
  };
  // 应用信息：版本、平台
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<unknown>;
  };
  // 系统诊断：获取诊断报告
  diagnostic: {
    get: () => Promise<unknown>;
  };
}

// 将 electronAPI 挂载到 window 对象上（由 preload.ts 的 contextBridge 提供）
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// 获取 API 实例：Electron 环境使用真实实现，浏览器开发模式使用 mock
function getApi(): ElectronAPI {
  // 如果 window.electronAPI 已存在（Electron 环境），直接使用
  if (window.electronAPI) return window.electronAPI;

  // 浏览器开发模式下的 mock 实现
  return {
    config: {
      get: () => Promise.resolve({}),
      save: () => Promise.resolve(),
      testConnection: () => Promise.resolve({ ok: true, msg: 'mock' }),
      export: () => Promise.resolve({}),
      import: () => Promise.resolve({ ok: false, msg: 'mock' }),
      importFromClaude: () => Promise.resolve({ ok: false, msg: 'mock' }),
    },
    cli: {
      start: () => Promise.resolve({ ok: true, pid: null, msg: 'mock: 仅在 Electron 环境中可用' }),
      stop: () => Promise.resolve(),
      input: () => Promise.resolve(),
      status: () => Promise.resolve({ status: 'idle', pid: null, sessionCount: 0 }),
      detect: () => Promise.resolve({ found: false, path: null }),
      install: () => Promise.resolve({ ok: true, mode: 'mock' }),
      onInstallProgress: () => () => {},
      onOutput: () => () => {},
      onExit: () => () => {},
      onStatus: () => () => {},
    },
    session: {
      list: () => Promise.resolve([]),
      create: () => Promise.resolve({ id: 'mock-session', name: '新会话' }),
      delete: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      autoTitle: () => Promise.resolve(),
      updateTags: () => Promise.resolve(),
      messages: {
        save: () => Promise.resolve(),
        load: () => Promise.resolve([]),
        delete: () => Promise.resolve(),
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
    diagnostic: {
      get: () => Promise.resolve({ system: {}, config: {}, db: {}, disk: {}, cli: {} }),
    },
  };
}

// 导出全局唯一的 API 实例
export const api = getApi();
