import { contextBridge, ipcRenderer } from 'electron';

/**
 * Context Bridge：安全边界，暴露主进程 API 给渲染进程
 * 不暴露 require/process，所有通信通过命名 IPC 通道
 */

const electronAPI = {
  // 配置管理
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (config: Record<string, unknown>) => ipcRenderer.invoke('config:save', config),
    testConnection: (config: Record<string, unknown>) => ipcRenderer.invoke('config:testConnection', config),
  },

  // CLI 进程管理
  cli: {
    start: (sessionId: string, projectDir: string, config: Record<string, unknown>) =>
      ipcRenderer.invoke('cli:start', { sessionId, projectDir, config }),
    stop: (sessionId: string) => ipcRenderer.invoke('cli:stop', sessionId),
    input: (sessionId: string, input: string) => ipcRenderer.invoke('cli:input', { sessionId, input }),
    status: () => ipcRenderer.invoke('cli:status'),
    // 事件订阅
    onOutput: (cb: (data: { sessionId: string; type: 'stdout' | 'stderr'; text: string; thinking?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] }) => void) => {
      const handler = (_: unknown, data: { sessionId: string; type: 'stdout' | 'stderr'; text: string; thinking?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] }) => cb(data);
      ipcRenderer.on('cli-output', handler);
      return () => ipcRenderer.removeListener('cli-output', handler);
    },
    // 流式更新（思考过程 + 工具调用实时推送）
    onStream: (cb: (data: { sessionId: string; thinking?: string; text?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] }) => void) => {
      const handler = (_: unknown, data: { sessionId: string; thinking?: string; text?: string; toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[] }) => cb(data);
      ipcRenderer.on('cli-stream', handler);
      return () => ipcRenderer.removeListener('cli-stream', handler);
    },
    onExit: (cb: (data: { sessionId: string; code: number; signal: string }) => void) => {
      const handler = (_: unknown, data: { sessionId: string; code: number; signal: string }) => cb(data);
      ipcRenderer.on('cli-exit', handler);
      return () => ipcRenderer.removeListener('cli-exit', handler);
    },
    onStatus: (cb: (data: { status: string; pid: number | null }) => void) => {
      const handler = (_: unknown, data: { status: string; pid: number | null }) => cb(data);
      ipcRenderer.on('cli-status', handler);
      return () => ipcRenderer.removeListener('cli-status', handler);
    },
    // 任务执行流（所有 CLI 事件）
    onTask: (cb: (data: { sessionId: string; type: string; subtype: string; timestamp: number; summary: string; raw: string }) => void) => {
      const handler = (_: unknown, data: { sessionId: string; type: string; subtype: string; timestamp: number; summary: string; raw: string }) => cb(data);
      ipcRenderer.on('cli-task', handler);
      return () => ipcRenderer.removeListener('cli-task', handler);
    },
  },

  // 会话管理
  session: {
    list: (projectId?: string) => ipcRenderer.invoke('session:list', { projectId }),
    create: (data: { projectId?: string; projectDir: string; name: string }) =>
      ipcRenderer.invoke('session:create', data),
    delete: (sessionId: string) => ipcRenderer.invoke('session:delete', sessionId),
    rename: (sessionId: string, name: string) => ipcRenderer.invoke('session:rename', { sessionId, name }),
    messages: {
      save: (data: { sessionId: string; role: string; content: string; timestamp: number; thinking?: string; toolSteps?: unknown[] }) =>
        ipcRenderer.invoke('session:messages:save', data),
      load: (sessionId: string) => ipcRenderer.invoke('session:messages:load', sessionId),
    },
  },

  // 日志管理
  log: {
    list: (filter?: { level?: string; component?: string; sessionId?: string; limit?: number }) =>
      ipcRenderer.invoke('log:list', filter),
    export: (filePath: string, format: string) => ipcRenderer.invoke('log:export', { filePath, format }),
    diagnostic: (filePath: string) => ipcRenderer.invoke('log:diagnostic', { filePath }),
  },

  // 插件管理
  plugin: {
    list: () => ipcRenderer.invoke('plugin:list'),
    toggle: (id: string, enabled: boolean) => ipcRenderer.invoke('plugin:toggle', { id, enabled }),
  },

  // 更新管理
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    importPatch: (filePath: string) => ipcRenderer.invoke('update:importPatch', { filePath }),
    info: () => ipcRenderer.invoke('update:info'),
  },

  // Skills 管理
  skill: {
    list: () => ipcRenderer.invoke('skill:list'),
    get: (id: string) => ipcRenderer.invoke('skill:get', id),
    create: (data: { name: string; description: string; content: string }) => ipcRenderer.invoke('skill:create', data),
    update: (data: { id: string; name: string; description: string; content: string }) => ipcRenderer.invoke('skill:update', data),
    delete: (id: string) => ipcRenderer.invoke('skill:delete', id),
    toggle: (id: string, enabled: boolean) => ipcRenderer.invoke('skill:toggle', { id, enabled }),
  },

  // 文件系统
  fs: {
    selectDirectory: () => ipcRenderer.invoke('fs:selectDirectory'),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  },

  // 应用信息
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// 类型声明供 renderer 使用
export type ElectronAPI = typeof electronAPI;
