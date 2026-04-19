import { contextBridge, ipcRenderer } from 'electron';

// 通过 contextBridge 安全暴露主进程 API 给渲染进程，所有通信均通过命名 IPC 通道

// 配置管理 API：获取、保存、测试连接、导入导出配置文件
const electronAPI = {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (config: Record<string, unknown>) => ipcRenderer.invoke('config:save', config),
    testConnection: (config: Record<string, unknown>) => ipcRenderer.invoke('config:testConnection', config),
    export: () => ipcRenderer.invoke('config:export'),
    import: (filePath: string) => ipcRenderer.invoke('config:import', filePath),
    // 从 Claude CLI 配置自动导入
    importFromClaude: () => ipcRenderer.invoke('config:importFromClaude'),
  },

  // CLI 进程管理 API：启动、停止、发送输入、查询状态及订阅各类事件
  cli: {
    start: (sessionId: string, projectDir: string, config: Record<string, unknown>) =>
      ipcRenderer.invoke('cli:start', { sessionId, projectDir, config }),
    stop: (sessionId: string) => ipcRenderer.invoke('cli:stop', sessionId),
    input: (sessionId: string, input: string) => ipcRenderer.invoke('cli:input', { sessionId, input }),
    status: () => ipcRenderer.invoke('cli:status'),
    // 检测系统 PATH 中是否已安装 claude
    detect: () => ipcRenderer.invoke('cli:detect'),
    // 安装 claude（useNpx=true 则用 npx 模式，否则全局 npm 安装）
    install: (useNpx: boolean) => ipcRenderer.invoke('cli:install', useNpx),
    // 监听安装进度事件
    onInstallProgress: (cb: (msg: string) => void) => {
      const handler = (_: unknown, msg: string) => cb(msg);
      ipcRenderer.on('cli-install-progress', handler);
      return () => ipcRenderer.removeListener('cli-install-progress', handler);
    },
    // 监听 CLI 输出事件（标准输出/标准错误），回调函数接收会话 ID、输出类型和文本内容
    onOutput: (cb: (data: { sessionId: string; type: 'stdout' | 'stderr'; text: string; thinking?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] }) => void) => {
      const handler = (_: unknown, data: { sessionId: string; type: 'stdout' | 'stderr'; text: string; thinking?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] }) => cb(data);
      ipcRenderer.on('cli-output', handler);
      return () => ipcRenderer.removeListener('cli-output', handler);
    },
    // 监听流式更新事件（思考过程和工具调用实时推送），回调函数接收会话 ID、思考内容、文本和工具步骤
    onStream: (cb: (data: { sessionId: string; thinking?: string; text?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] }) => void) => {
      const handler = (_: unknown, data: { sessionId: string; thinking?: string; text?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] }) => cb(data);
      ipcRenderer.on('cli-stream', handler);
      return () => ipcRenderer.removeListener('cli-stream', handler);
    },
    // 监听 CLI 退出事件，回调函数接收会话 ID、退出码和信号
    onExit: (cb: (data: { sessionId: string; code: number; signal: string }) => void) => {
      const handler = (_: unknown, data: { sessionId: string; code: number; signal: string }) => cb(data);
      ipcRenderer.on('cli-exit', handler);
      return () => ipcRenderer.removeListener('cli-exit', handler);
    },
    // 监听 CLI 状态变化事件，回调函数接收当前状态和进程 ID
    onStatus: (cb: (data: { status: string; pid: number | null }) => void) => {
      const handler = (_: unknown, data: { status: string; pid: number | null }) => cb(data);
      ipcRenderer.on('cli-status', handler);
      return () => ipcRenderer.removeListener('cli-status', handler);
    },
    // 监听任务执行事件（所有 CLI 事件流），回调函数接收会话 ID、事件类型、子类型、时间戳、摘要和原始数据
    onTask: (cb: (data: { sessionId: string; type: string; subtype: string; timestamp: number; summary: string; raw: string }) => void) => {
      const handler = (_: unknown, data: { sessionId: string; type: string; subtype: string; timestamp: number; summary: string; raw: string }) => cb(data);
      ipcRenderer.on('cli-task', handler);
      return () => ipcRenderer.removeListener('cli-task', handler);
    },
  },

  // 会话管理 API：列表查询、创建、删除、重命名、自动标题、标签更新及消息读写
  session: {
    list: (projectId?: string, tag?: string) => ipcRenderer.invoke('session:list', { projectId, tag }),
    create: (data: { projectId?: string; projectDir: string; name: string }) =>
      ipcRenderer.invoke('session:create', data),
    delete: (sessionId: string) => ipcRenderer.invoke('session:delete', sessionId),
    rename: (sessionId: string, name: string) => ipcRenderer.invoke('session:rename', { sessionId, name }),
    autoTitle: (data: { sessionId: string; title: string }) => ipcRenderer.invoke('session:autoTitle', data),
    updateTags: (data: { sessionId: string; tags: string[] }) => ipcRenderer.invoke('session:updateTags', data),
    togglePin: (data: { sessionId: string; pinned: boolean }) => ipcRenderer.invoke('session:togglePin', data),
    fork: (data: { sessionId: string; newName?: string }) => ipcRenderer.invoke('session:fork', data),
    setBudget: (data: { sessionId: string; budgetLimit: number | null }) => ipcRenderer.invoke('session:setBudget', data),
    getBudget: (sessionId: string) => ipcRenderer.invoke('session:getBudget', sessionId),
    stats: (sessionId: string) => ipcRenderer.invoke('session:stats', sessionId),
    exportSession: (sessionId: string) => ipcRenderer.invoke('session:export', sessionId),
    messages: {
      save: (data: { sessionId: string; role: string; content: string; timestamp: number; thinking?: string; toolSteps?: unknown[] }) =>
        ipcRenderer.invoke('session:messages:save', data),
      load: (sessionId: string) => ipcRenderer.invoke('session:messages:load', sessionId),
      delete: (sessionId: string, messageId: number) => ipcRenderer.invoke('session:messages:delete', { sessionId, messageId }),
    },
  },

  // 日志管理 API：列表查询、导出、诊断报告、删除和清空
  log: {
    list: (filter?: { level?: string; component?: string; sessionId?: string; limit?: number }) =>
      ipcRenderer.invoke('log:list', filter),
    export: (filePath: string, format: string) => ipcRenderer.invoke('log:export', { filePath, format }),
    diagnostic: (filePath: string) => ipcRenderer.invoke('log:diagnostic', { filePath }),
    delete: (id: number) => ipcRenderer.invoke('log:delete', id),
    clear: () => ipcRenderer.invoke('log:clear'),
  },

  // 插件管理 API：查询插件列表和切换插件启用状态
  plugin: {
    list: () => ipcRenderer.invoke('plugin:list'),
    toggle: (id: string, enabled: boolean) => ipcRenderer.invoke('plugin:toggle', { id, enabled }),
  },

  // 更新管理 API：检查更新、导入补丁、查询当前版本信息
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    importPatch: (filePath: string) => ipcRenderer.invoke('update:importPatch', { filePath }),
    info: () => ipcRenderer.invoke('update:info'),
  },

  // Skills 管理 API：查询、创建、更新、删除和切换技能启用状态
  skill: {
    list: () => ipcRenderer.invoke('skill:list'),
    get: (id: string) => ipcRenderer.invoke('skill:get', id),
    create: (data: { name: string; description: string; content: string }) => ipcRenderer.invoke('skill:create', data),
    update: (data: { id: string; name: string; description: string; content: string }) => ipcRenderer.invoke('skill:update', data),
    delete: (id: string) => ipcRenderer.invoke('skill:delete', id),
    toggle: (id: string, enabled: boolean) => ipcRenderer.invoke('skill:toggle', { id, enabled }),
  },

  // 应用信息 API：获取应用版本号和运行平台
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  },

  // 系统诊断 API：获取系统诊断信息
  diagnostic: {
    get: () => ipcRenderer.invoke('diagnostic:get'),
  },

  // 知识库 API
  knowledge: {
    add: (data: { title: string; content: string; category?: string; tags?: string[] }) => ipcRenderer.invoke('knowledge:add', data),
    list: (category?: string) => ipcRenderer.invoke('knowledge:list', category),
    get: (id: number) => ipcRenderer.invoke('knowledge:get', id),
    delete: (id: number) => ipcRenderer.invoke('knowledge:delete', id),
    update: (data: { id: number; title: string; content: string; category?: string; tags?: string[] }) => ipcRenderer.invoke('knowledge:update', data),
    search: (data: { query: string; category?: string; limit?: number }) => ipcRenderer.invoke('knowledge:search', data),
    import: (data: { filePath: string; category?: string }) => ipcRenderer.invoke('knowledge:import', data),
  },

  // Prompt 模板 API
  template: {
    list: (category?: string) => ipcRenderer.invoke('template:list', category),
    get: (id: string) => ipcRenderer.invoke('template:get', id),
    create: (data: { name: string; description?: string; category?: string; prompt: string; icon?: string }) => ipcRenderer.invoke('template:create', data),
    delete: (id: string) => ipcRenderer.invoke('template:delete', id),
    apply: (data: { id: string; variables: Record<string, string> }) => ipcRenderer.invoke('template:apply', data),
  },

  // 工具统计 API
  tool: {
    list: () => ipcRenderer.invoke('tool:list'),
    session: (sessionId: string) => ipcRenderer.invoke('tool:session', sessionId),
    record: (data: { sessionId: string; toolName: string; success: boolean }) => ipcRenderer.invoke('tool:record', data),
    reset: () => ipcRenderer.invoke('tool:reset'),
  },

  // 文件浏览 API
  fs: {
    selectDirectory: () => ipcRenderer.invoke('fs:selectDirectory'),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    readdir: (dirPath: string) => ipcRenderer.invoke('fs:readdir', dirPath),
    stat: (filePath: string) => ipcRenderer.invoke('fs:stat', filePath),
    readImage: (filePath: string) => ipcRenderer.invoke('fs:readImage', filePath),
    selectFiles: (filters?: Array<{ name: string; extensions: string[] }>) => ipcRenderer.invoke('fs:selectFiles', filters),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// 导出类型声明供渲染进程使用
export type ElectronAPI = typeof electronAPI;
