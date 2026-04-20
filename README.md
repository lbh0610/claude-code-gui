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
│     ├── template-manager.ts   ── Prompt 模板管理              │
│     ├── tool-manager.ts       ── 工具使用统计                 │
│     ├── knowledge-manager.ts  ── 知识库/RAG（TF-IDF 搜索）     │
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
│  @tanstack/react-query (状态缓存)                              │
│  React Router (HashRouter)                                   │
│                                                              │
│  10 个页面：首页 / 工作区 / 会话历史 / 日志 /                  │
│           系统诊断 / 设置 / Skills / 更新 /                   │
│           知识库 / 插件                                       │
│  13 个组件：ChatBubble / ImagePreview / Sidebar / TopBar /    │
│           StatusCard / Terminal / EmbeddedTerminal /          │
│           FileExplorer / TemplatePicker / ToolsPanel /        │
│           ErrorBoundary / Toast / OnboardingWizard            │
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
sessions       ── 会话 (id, project_dir, name, tags, status, cli_pid, summary, pinned)
messages       ── 消息 (session_id, role, content, thinking, tool_steps, cost, duration, tokens...)
configs        ── 配置 (key, value, encrypted)
logs           ── 日志 (timestamp, component, level, event, summary, session_id, content)
plugins        ── 插件 (id, name, version, enabled, source)
user_skills    ── 自定义 Skills (id, enabled)
update_history ── 更新记录 (from_version, to_version, status, method)
knowledge      ── 知识库文档 (id, title, content, category, tags)
templates      ── Prompt 模板 (id, name, description, category, prompt, icon)
tool_stats     ── 工具统计 (tool_name, total_calls, total_success, sessions)
```

---

## Technology Stack / 技术栈

| Layer | Technology |
|-------|-----------|
| Framework | Electron 33 |
| Renderer | React 18 + TypeScript + Vite 6 |
| Routing | React Router (HashRouter) |
| State | @tanstack/react-query + React useState/useRef |
| Database | better-sqlite3 (WAL mode + foreign keys) |
| Encryption | Node.js crypto (AES-256-GCM) |
| Terminal | node-pty (PTY 终端) |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| Build | electron-builder (macOS DMG arm64/x64, Windows NSIS x64) |

---

## Getting Started / 快速开始

### Prerequisites / 前置条件

- Node.js >= 18
- npm >= 9
- Claude Code CLI（已安装并在 PATH 中）

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

### Package / 打包

产物统一输出至 `release/` 目录。

#### macOS DMG 安装包（Apple Silicon）

```bash
npm run package:mac
```

输出：`release/Agent Workbench-0.1.0-arm64.dmg`

#### macOS DMG 安装包（Intel）

```bash
npm run package:mac:all
```

输出：`release/Agent Workbench-0.1.0-x64.dmg`

#### Windows NSIS 安装包

```bash
npm run package:win
```

输出：`release/Agent Workbench Setup 0.1.0.exe`

> **注意**：Windows 打包需在 Windows 环境或配置好 wine 的 macOS 上执行。

---

## Feature Modules / 功能模块

| 页面 | 路由 | 功能描述 |
|------|------|----------|
| 首页 | `/` | CLI 状态、今日使用统计（回复数/Token/费用）、快捷操作、最近会话列表、`⌘K` 快速跳转搜索 |
| 工作区 | `/workspace` | **多会话 Tab 并行**、三栏布局（会话列表 / 聊天 / 上下文面板）、CLI 生命周期管理、**流式打字机**渲染（思考过程 + 工具调用）、**图片拖拽/粘贴/上传**、任务执行流面板、会话内消息搜索/删除/历史加载继续对话、内嵌终端、文件浏览器 + 代码预览、Prompt 模板选择器、工具/MCP 统计面板、费用预算控制 |
| 会话历史 | `/sessions` | 会话列表、标签编辑/过滤、搜索、批量删除、重命名、**会话分支 (Fork)**、导出 Markdown、置顶/排序 |
| 日志 | `/logs` | 日志级别筛选、关键词搜索、按会话过滤、详情面板、导出 JSON、批量删除、清空全部 |
| 系统诊断 | `/plugins` | 系统环境（OS/CPU/内存）、配置状态（API Key/模型/代理/系统提示词）、数据库统计、CLI 引擎状态、存储用量、连接测试、一键清日志 |
| 知识库 | `/knowledge` | **知识库/RAG**、TF-IDF 关键词搜索（支持中文分词）、文档分类/标签、文件导入、添加/编辑/删除文档、相关度评分 |
| 设置 | `/settings` | 通用配置、系统提示词（含快速预设）、账号与 API Key（AES-256-GCM 加密存储）、模型与网关、代理、配置导入/导出 |
| Skills | `/skills` | Claude Code 自定义 Skills 的增删改查、启用/禁用、内容编辑、Markdown 渲染预览 |
| 更新 | `/updates` | 版本信息、在线检查更新、离线补丁导入 |

### 核心功能特性

#### 流式打字机
- AI 回复逐字显示（~200 chars/sec），基于 `requestAnimationFrame` 平滑动画
- 非流式消息立即渲染，流式消息带光标闪烁指示器
- 思考过程和工具调用区域自动展开/折叠

#### 图片上传（拖拽 / 粘贴 / 文件选择）
- 支持 `Cmd+V` 粘贴剪贴板图片
- 支持拖拽文件到输入框
- 支持通过文件选择器选择图片
- 上传后显示缩略图预览网格，可删除/点击放大
- 发送时自动转为 Base64 Data URL 嵌入 Markdown 图片语法

#### 多会话并行（Tab 式）
- 顶部 Tab 栏同时展示多个活跃会话
- 每个 Tab 有运行状态指示（运行中/空闲）和关闭按钮
- 切换 Tab 不中断其他会话运行
- CLI 事件按 `sessionId` 自动分发到对应 Tab
- 新建 Tab 不阻塞已有会话

#### 会话分支 (Fork)
- 从任意历史会话创建分支，复制前半部分对话
- 新分支可继续对话，探索不同方向

#### 费用预算控制
- 每个会话可设置费用预算上限
- 实时显示当前费用和 Token 用量
- 超出预算时高亮警告

#### 知识库 / RAG
- 手动添加文档或导入文件（.txt/.md/.json/.csv）
- TF-IDF 关键词搜索，支持中文二元分词
- 分类/标签过滤，相关度评分排序

#### Prompt 模板
- 内置/自定义 Prompt 模板库
- 支持 `{{variable}}` 变量占位符
- 选择模板时弹出变量填写表单
- 点击快捷按钮直接插入预设文本

#### 工具/MCP 可视化
- 内置工具 vs MCP Server 分类展示
- 调用次数、成功率、涉及会话数统计
- 成功率进度条颜色编码（>=90% 绿 / >=70% 黄 / <70% 红）

#### 文件浏览器 + 代码预览
- 右侧面板可浏览项目目录树
- 点击文件在线预览（带行号）
- 递归展开/折叠子目录
- 文件类型图标映射（TS/TSX/JS/Python/Go/Rust 等）

#### 内嵌终端
- 显示 CLI 实时输出（stdout/stderr）
- 可拖拽调整高度，可折叠/展开/清除
- 自动滚动到底部

#### 会话管理
- 按项目目录自动归档、标签分组、自动生成标题、跨重启持久化、继续历史对话
- 批量操作：会话批量删除、日志批量删除
- 置顶会话、多种排序（最近/创建/费用/名称）
- 导出会话为 Markdown 文件

#### 安全存储
- API Key 使用 AES-256-GCM 加密，避免明文泄露；递归加密防护
- 首次启动自动从 Claude CLI 配置导入

#### 快捷键
- `⌘/Ctrl + Enter`：发送消息
- `Shift + Enter`：输入换行
- `?`：显示/隐藏快捷键面板

#### 主题切换
- 亮色/暗色双主题，通过 CSS 自定义属性实现
- 主题偏好持久化到配置中

---

## IPC Channels / IPC 通信通道

| Namespace | Channels | Description |
|-----------|----------|-------------|
| `config` | `get` / `save` / `testConnection` / `export` / `import` / `importFromClaude` | 配置读写 + 连接测试 + 导入/导出 |
| `cli` | `start` / `stop` / `input` / `status` / `detect` / `install` / `onOutput` / `onStream` / `onExit` / `onStatus` / `onTask` / `onInstallProgress` | CLI 进程控制与事件监听（含流式更新 + 安装进度） |
| `session` | `list` / `create` / `delete` / `rename` / `autoTitle` / `updateTags` / `togglePin` / `fork` / `setBudget` / `getBudget` / `stats` / `export` / `messages:save` / `messages:load` / `messages:delete` | 会话 CRUD + 消息持久化 + 标签/自动标题/置顶/分支/预算 |
| `log` | `list` / `export` / `diagnostic` / `delete` / `clear` | 日志查询、导出、删除、清空 |
| `plugin` | `list` / `toggle` | 插件管理 |
| `skill` | `list` / `get` / `create` / `update` / `delete` / `toggle` | Skills CRUD + 启停 |
| `knowledge` | `add` / `list` / `get` / `delete` / `update` / `search` / `import` | 知识库/RAG 文档 CRUD + TF-IDF 搜索 |
| `template` | `list` / `get` / `create` / `delete` / `apply` | Prompt 模板 CRUD + 变量替换 |
| `tool` | `list` / `session` / `record` / `reset` | 工具使用统计 |
| `update` | `check` / `importPatch` / `info` | 更新管理 |
| `diagnostic` | `get` | 系统诊断信息汇总 |
| `fs` | `selectDirectory` / `readFile` / `readdir` / `stat` / `readImage` / `selectFiles` | 文件系统操作 |
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
│       ├── session-manager.ts        # 会话 CRUD + 消息持久化 + 标签/自动标题/分支/预算
│       ├── skill-manager.ts          # Skills 管理
│       ├── template-manager.ts       # Prompt 模板管理 + 变量替换
│       ├── tool-manager.ts           # 工具使用统计
│       ├── knowledge-manager.ts      # 知识库/RAG（TF-IDF 搜索 + 中文分词）
│       ├── log-manager.ts            # 日志查询 + 诊断包 + 清日志
│       ├── diagnostics-manager.ts    # 系统诊断中心（系统/配置/DB/CLI/存储）
│       ├── plugin-manager.ts         # 插件扫描/启停
│       └── updater.ts                # 版本检查 + 离线补丁
├── database/
│   └── schema.sql                    # 核心数据表
├── config/
│   └── default.json                  # 默认配置
├── renderer/                         # 渲染进程 (React)
│   ├── vite.config.ts
│   ├── src/
│   │   ├── lib/api.ts                # IPC 封装 + Browser Mock
│   │   ├── components/
│   │   │   ├── ChatBubble.tsx        # 聊天气泡 + 流式打字机 + 代码高亮
│   │   │   ├── ImagePreview.tsx      # 图片缩略图 + 大图预览
│   │   │   ├── Sidebar.tsx           # 侧边栏导航
│   │   │   ├── TopBar.tsx            # 顶部栏
│   │   │   ├── StatusCard.tsx        # 状态卡片
│   │   │   ├── Terminal.tsx          # 终端组件
│   │   │   ├── EmbeddedTerminal.tsx  # 内嵌终端（CLI 输出）
│   │   │   ├── FileExplorer.tsx      # 文件浏览器 + 代码预览
│   │   │   ├── TemplatePicker.tsx    # Prompt 模板选择器
│   │   │   ├── ToolsPanel.tsx        # 工具/MCP 统计面板
│   │   │   ├── ErrorBoundary.tsx     # 错误边界
│   │   │   ├── Toast.tsx             # Toast 通知
│   │   │   └── OnboardingWizard.tsx  # 新手引导
│   │   └── pages/
│   │       ├── Home.tsx              # 首页（状态 + 统计 + 快捷操作）
│   │       ├── Workspace.tsx         # 工作区（多会话 Tab + 聊天 + 上下文）
│   │       ├── Sessions.tsx          # 会话历史（列表 + 过滤 + 分支 + 导出）
│   │       ├── Logs.tsx              # 日志查看与管理
│   │       ├── Plugins.tsx           # 系统诊断中心
│   │       ├── KnowledgeBase.tsx     # 知识库/RAG
│   │       ├── Settings.tsx          # 设置中心
│   │       ├── Skills.tsx            # Skills 管理
│   │       └── Updates.tsx           # 更新管理
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
