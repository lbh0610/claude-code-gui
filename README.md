# Agent Workbench

**A Visual Desktop GUI for Claude Code CLI**

可视化 AI 编程助手桌面客户端 —— 基于 Electron 封装 Claude Code CLI 的 GUI。

---

## Project Value / 项目价值

### Why This Project Exists / 为什么需要这个项目

**Problem / 痛点：**

Claude Code 是一个强大的 CLI 编程助手，但终端界面存在天然局限：

- 纯文本终端无法展示结构化对话、代码块高亮不够直观
- 历史记录管理困难，无法按项目/会话分类检索
- 多项目并行时缺乏可视化的会话切换机制
- 配置 API Key、代理、模型参数等需要记忆命令行参数
- 无法快速查看日志、诊断问题

**Solution / 解决方案：**

将 Claude Code CLI 封装为带三栏聊天界面的桌面应用：

- 聊天气泡渲染，支持 Markdown 代码高亮、表格、列表
- 按项目自动归档会话，支持历史回溯与继续对话
- 一键切换会话、项目目录、模型配置
- 内置日志管理、插件管理、版本更新功能
- 支持离线使用、离线补丁导入

### Target Users / 目标用户

| 用户 | 价值 |
|------|------|
| 开发者 | 不用离开 IDE 就能管理多个项目的 AI 对话 |
| 技术经理 | 统一配置模型、API 网关，团队标准化 |
| 初学者 | 可视化界面降低了 CLI 使用门槛 |
| 离线环境用户 | 支持离线补丁，网络受限时仍可使用 |

---

## Architecture / 架构设计

### 整体架构 / Overall Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Electron 主进程                          │
│                                                              │
│  main.ts ── 窗口管理 + IPC 路由分发                          │
│     │                                                        │
│     ├── cli-manager.ts        ── spawn('claude') 子进程管理   │
│     ├── config-manager.ts     ── 配置读写 + API Key 加密      │
│     ├── session-manager.ts    ── SQLite 会话 CRUD + 标签      │
│     ├── skill-manager.ts      ── Skills 管理                  │
│     ├── log-manager.ts        ── 日志查询 + 诊断包导出         │
│     ├── diagnostics-manager.ts ── 系统诊断中心（聚合信息）     │
│     ├── plugin-manager.ts     ── 插件扫描/启停                │
│     └── updater.ts            ── 版本检查 + 离线补丁导入        │
│                                                              │
│  database.ts ── better-sqlite3 封装                          │
│  config.ts ── 应用目录初始化                                  │
│                                                              │
│         ↕ IPC (invoke/handle + webContents.send)             │
├──────────────────────────────────────────────────────────────┤
│                     Electron 渲染进程                        │
│                                                              │
│  React 18 + TypeScript + Vite 6                              │
│  @tanstack/react-query (状态管理)                              │
│  React Router (HashRouter)                                   │
│                                                              │
│  8 个页面：首页 / 工作区 / 会话历史 / 日志诊断                 │
│           系统诊断 / 设置中心 / Skills / 更新管理              │
│  核心页面 Workspace：三栏布局（会话列表 / 聊天 / 上下文）       │
│                                                              │
│  preload.ts ── contextBridge 安全隔离                        │
└──────────────────────────────────────────────────────────────┘
```

### CLI 通信协议 / CLI Communication Protocol

```
用户输入 → api.cli.input(sessionId, text)
            ↕ IPC
         cli-manager.sendInput()
            ↕ stdin (JSON 行)
      ┌─────────────┐
      │  claude 子进程 │  claude -p --verbose
      │  (ChildProcess) │  --input-format=stream-json
      │               │  --output-format=stream-json
      └──────┬────────┘
             ↕ stdout (JSON 行)
         逐行解析：
           - type: assistant → 累积回复文本
           - type: result    → 发送完整 assistant 气泡
           - type: system    → 系统事件（init、error）
             ↕ webContents.send('cli-output')
             ↕ IPC
         React 渲染聊天气泡 + 持久化到 SQLite
```

### 数据模型 / Data Model

```sql
sessions       ── 会话 (id, project_dir, name, tags, status, cli_pid, summary)
messages       ── 消息 (session_id, role, content, thinking, tool_steps, cost, duration, tokens...)
configs        ── 配置 (key, value, encrypted)
logs           ── 日志 (timestamp, component, level, event, summary)
plugins        ── 插件 (id, name, version, enabled, source)
user_skills    ── 自定义 Skills (id, enabled)
update_history ── 更新记录 (from_version, to_version, status, method)
```

---

## Technology Stack / 技术栈

| Layer | Technology |
|-------|-----------|
| Framework | Electron 33 |
| Renderer | React 18 + TypeScript + Vite 6 |
| Routing | React Router (HashRouter) |
| State | @tanstack/react-query + React useState/useRef |
| Database | better-sqlite3 |
| Encryption | Node.js crypto (AES-256-GCM) |
| Build | electron-builder (macOS DMG arm64/x64, Windows NSIS x64) |

---

## Getting Started / 快速开始

### Prerequisites / 前置条件

- Node.js >= 18
- npm >= 9
- macOS ARM64（开发/打包环境）

### Installation / 安装

```bash
cd claude-code-gui
npm install
```

### Development / 开发

```bash
# 推荐：同时启动 Vite + Electron
npm run dev

# 或分别启动：
# 终端 1 - Vite 开发服务器
npm run dev:renderer

# 终端 2 - Electron
npm start
```

### Build / 构建

```bash
# 构建 renderer + 编译 Electron 主进程
npm run build
```

### Build / 构建

```bash
# 构建 renderer + 编译 Electron 主进程
npm run build
```

### Package / 打包

产物统一输出至 `release/` 目录。

#### macOS DMG 安装包（Apple Silicon）

```bash
npm run package:mac
```

输出：`release/Agent Workbench-0.1.0-arm64.dmg`

#### macOS DMG 安装包（Intel）

```bash
npm run package:mac
# 修改 electron-builder.json 中 mac.target.arch 为 ["x64"] 即可
```

输出：`release/Agent Workbench-0.1.0-x64.dmg`

#### Windows NSIS 安装包

```bash
npm run package:win
```

输出：`release/Agent Workbench Setup 0.1.0.exe`

> **注意**：Windows 打包需在 Windows 环境或配置好 wine 的 macOS 上执行。推荐直接在 Windows 机器上操作。

#### 同时打包 macOS + Windows

```bash
npm run package:all
```

#### 打包步骤详解

```bash
# 1. 安装依赖（首次操作或 package.json 变更时）
npm install

# 2. 构建产物（renderer 前端 + electron 主进程编译）
npm run build

# 3a. 打包 macOS DMG
npm run package:mac

# 3b. 打包 Windows 安装包
npm run package:win

# 4. 检查输出
ls release/
```

#### 打包注意事项

- **better-sqlite3** 等原生模块需针对目标平台重新编译，跨平台打包建议在对应平台上执行
- **node-pty** 依赖 Python 和 C++ 编译工具链，macOS 需安装 Xcode Command Line Tools，Windows 需安装 Visual Studio Build Tools
- 如需代码签名，在 `electron-builder.json` 中添加 `mac.identity` / `win.signAndEditFiles` 配置
- 如不携带 native-bin，删除 `extraResources` 配置即可

---

## Feature Modules / 功能模块

| 页面 | 路由 | 功能描述 |
|------|------|----------|
| 首页 | `/` | CLI 状态、今日使用统计（回复数/Token/费用）、快捷操作、最近会话列表、`⌘K` 快速跳转搜索 |
| 工作区 | `/workspace` | 三栏布局（会话列表 / 聊天 / 上下文面板），CLI 生命周期管理，流式消息渲染（思考过程 + 工具调用），任务执行流面板，会话内消息搜索、单条删除、历史加载继续对话 |
| 会话历史 | `/sessions` | 会话列表、标签编辑/过滤、搜索、批量删除、重命名 |
| 日志诊断 | `/logs` | 日志级别筛选、关键词搜索、详情面板、导出诊断包、清除日志 |
| 系统诊断 | `/plugins` | 系统环境（OS/CPU/内存）、配置状态（API Key/模型/代理/系统提示词）、数据库统计、CLI 引擎状态、存储用量、连接测试、一键清日志 |
| 设置 | `/settings` | 通用配置、系统提示词（含快速预设）、账号与 API Key（AES-256-GCM 加密存储）、模型与网关、代理、配置导入/导出 |
| Skills | `/skills` | Claude Code 自定义 Skills 的增删改查、启用/禁用、内容编辑 |
| 更新 | `/updates` | 版本信息、在线检查更新、离线补丁导入 |

### 核心功能特性

- **会话管理**：按项目目录自动归档、标签分组、自动生成标题、跨重启持久化、继续历史对话
- **流式渲染**：实时显示 AI 思考过程、工具调用步骤（running → done 状态机）
- **安全存储**：API Key 使用 AES-256-GCM 加密，避免明文泄露；递归加密防护
- **批量操作**：会话批量删除、插件批量启/禁用
- **快捷键**：`⌘K` 全局快速跳转搜索会话
- **消息操作**：每条消息可单独删除、整条复制，内容区域支持文本选中复制
- **自定义系统提示词**：支持快速预设（简洁模式/中文注释/前端专家）
- **环境隔离**：自定义环境变量注入、代理配置、模型切换

---

## IPC Channels / IPC 通信通道

| Namespace | Channels | Description |
|-----------|----------|-------------|
| `config` | `get` / `save` / `testConnection` / `export` / `import` | 配置读写 + 连接测试 + 导入/导出 |
| `cli` | `start` / `stop` / `input` / `status` / `onOutput` / `onStream` / `onExit` / `onStatus` / `onTask` | CLI 进程控制与事件监听（含流式更新） |
| `session` | `list` / `create` / `delete` / `rename` / `autoTitle` / `updateTags` / `messages:save` / `messages:load` / `messages:delete` | 会话 CRUD + 消息持久化 + 标签 + 自动标题 |
| `log` | `list` / `export` / `diagnostic` / `delete` / `clear` | 日志查询、导出、删除、清空 |
| `plugin` | `list` / `toggle` | 插件管理 |
| `skill` | `list` / `get` / `create` / `update` / `delete` / `toggle` | Skills CRUD + 启停 |
| `update` | `check` / `importPatch` / `info` | 更新管理 |
| `diagnostic` | `get` | 系统诊断信息汇总 |
| `fs` | `selectDirectory` / `readFile` | 文件系统操作 |
| `app` | `getVersion` / `getPlatform` | 应用信息 |

---

## Data Storage / 数据存储

| Resource | Path |
|----------|------|
| Database | `~/Library/Application Support/agent-workbench/app.db` |
| Logs | `~/Library/Application Support/agent-workbench/logs/` |
| Plugins | `~/Library/Application Support/agent-workbench/plugins/` |
| Config | `~/Library/Application Support/agent-workbench/config.json` |

---

## Project Structure / 项目结构

```
├── electron/                         # 主进程
│   ├── main.ts                       # 入口、窗口、IPC 注册
│   ├── preload.ts                    # Context Bridge 安全隔离
│   ├── config.ts                     # 路径与目录初始化
│   ├── database.ts                   # SQLite 封装（含迁移）
│   └── handlers/
│       ├── cli-manager.ts            # Claude Code 子进程管理（stream-json）
│       ├── config-manager.ts         # 配置读写 + API Key AES-256-GCM 加密
│       ├── session-manager.ts        # 会话 CRUD + 消息持久化 + 标签/自动标题
│       ├── skill-manager.ts          # Skills 管理
│       ├── log-manager.ts            # 日志查询 + 诊断包 + 清日志
│       ├── diagnostics-manager.ts    # 系统诊断中心（系统/配置/DB/CLI/存储）
│       ├── plugin-manager.ts         # 插件扫描/启停
│       └── updater.ts                # 版本检查 + 离线补丁
├── database/
│   └── schema.sql                    # 7 张核心表
├── config/
│   └── default.json                  # 默认配置
├── renderer/                         # 渲染进程 (React)
│   ├── vite.config.ts
│   ├── src/
│   │   ├── lib/api.ts                # IPC 封装 + Browser Mock
│   │   ├── components/               # ChatBubble, Sidebar, TopBar, Terminal, StatusCard, ErrorBoundary
│   │   └── pages/                    # 8 个页面
│   └── dist/                         # 构建产物
├── electron-builder.json             # DMG 打包配置
├── tsconfig.base.json                # 共享 TS 配置
└── package.json                      # 根工作区 (npm workspaces)
```

---

## IMG 运行图片

![运行图片1](img/运行图片1.png)

![运行图片2](img/运行图片2.png)

![运行图片3](img/运行图片3.png)

![运行图片4](img/运行图片4.png)

## License

MIT
