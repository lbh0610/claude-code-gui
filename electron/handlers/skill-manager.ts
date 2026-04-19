// 引入文件系统模块，用于读写 Skill 文件
import fs from 'node:fs';
// 引入路径模块，用于路径拼接
import path from 'node:path';
// 引入数据库连接获取函数
import { getDb } from '../database';
// 引入 Skills 目录常量
import { SKILLS_PATH } from '../config';

/**
 * Skill 信息接口
 */
interface SkillInfo {
  id: string;           // Skill 唯一标识（目录名）
  name: string;         // Skill 名称
  description: string;  // Skill 描述
  content: string;      // SKILL.md 正文内容
  subdirs: string[];    // 子目录列表
  enabled: boolean;     // 是否启用
}

/**
 * 解析单个 Skill 目录，返回 SkillInfo
 * @param id - Skill 目录名
 * @returns SkillInfo 或 null（SKILL.md 不存在时）
 */
function parseSkill(id: string): SkillInfo | null {
  // 拼接 SKILL.md 的完整路径
  const dir = path.join(SKILLS_PATH, id);
  const skillPath = path.join(dir, 'SKILL.md');
  // 文件不存在则跳过
  if (!fs.existsSync(skillPath)) return null;
  // 读取 Markdown 内容
  const md = fs.readFileSync(skillPath, 'utf-8');
  // 匹配 frontmatter 块（--- 包裹的 YAML 头）
  const match = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fm = match ? match[1] : '';
  // 从 frontmatter 中提取 name
  const nameMatch = fm.match(/name:\s*(.+)/);
  // 从 frontmatter 中提取 description
  const descMatch = fm.match(/description:\s*(.+)/);
  // 读取子目录列表
  const entries = fs.readdirSync(dir);
  return {
    id,
    name: nameMatch ? nameMatch[1].trim() : id,
    description: descMatch ? descMatch[1].trim() : '',
    content: match ? match[2].trim() : md,
    subdirs: entries.filter(e => fs.statSync(path.join(dir, e)).isDirectory()),
    enabled: getSkillEnabled(id),
  };
}

/**
 * 查询 Skill 的启用状态
 * @param id - Skill ID
 * @returns 是否启用
 */
function getSkillEnabled(id: string): boolean {
  const db = getDb();
  // 从 user_skills 表中查询
  const row = db.prepare('SELECT enabled FROM user_skills WHERE id = ?').get(id) as { enabled: number } | undefined;
  // 默认启用（表中无记录时返回 true）
  return row ? row.enabled === 1 : true;
}

/**
 * 列出所有已安装的 Skill
 * @returns Skill 列表
 */
export function listSkills(): SkillInfo[] {
  // 确保目录存在
  if (!fs.existsSync(SKILLS_PATH)) fs.mkdirSync(SKILLS_PATH, { recursive: true });
  try {
    return fs.readdirSync(SKILLS_PATH)
      // 只保留子目录
      .filter(d => fs.statSync(path.join(SKILLS_PATH, d)).isDirectory())
      // 解析每个目录
      .map(parseSkill)
      // 过滤掉无效结果
      .filter((s): s is SkillInfo => s !== null);
  } catch {
    // 读取失败时返回空列表
    return [];
  }
}

/**
 * 获取单个 Skill 的详细信息
 * @param id - Skill ID
 * @returns SkillInfo 或 null
 */
export function getSkill(id: string): SkillInfo | null {
  return parseSkill(id);
}

/**
 * 创建新 Skill
 * @param name - Skill 名称
 * @param description - Skill 描述
 * @param content - Skill 正文内容
 * @returns 创建结果
 */
export function createSkill(name: string, description: string, content: string): { ok: boolean; id: string; msg?: string } {
  // 确保目录存在
  if (!fs.existsSync(SKILLS_PATH)) fs.mkdirSync(SKILLS_PATH, { recursive: true });
  // 将名称转为 URL 安全的 ID（支持中文）
  const id = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  // ID 不能为空
  if (!id) return { ok: false, id: '', msg: '名称无效' };
  const dir = path.join(SKILLS_PATH, id);
  // 已存在则不允许创建
  if (fs.existsSync(dir)) return { ok: false, id: '', msg: 'Skill 已存在' };
  // 创建目录
  fs.mkdirSync(dir, { recursive: true });
  // 写入 SKILL.md 文件（含 frontmatter）
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}`, 'utf-8');
  return { ok: true, id };
}

/**
 * 更新已有 Skill
 * @param id - Skill ID
 * @param name - 新名称
 * @param description - 新描述
 * @param content - 新内容
 * @returns 更新结果
 */
export function updateSkill(id: string, name: string, description: string, content: string): { ok: boolean; msg?: string } {
  const dir = path.join(SKILLS_PATH, id);
  // 目录不存在则返回错误
  if (!fs.existsSync(dir)) return { ok: false, msg: 'Skill 不存在' };
  // 重写 SKILL.md 文件
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}`, 'utf-8');
  return { ok: true };
}

/**
 * 删除 Skill 及其数据库记录
 * @param id - Skill ID
 * @returns 删除结果
 */
export function deleteSkill(id: string): { ok: boolean; msg?: string } {
  const dir = path.join(SKILLS_PATH, id);
  // 目录不存在则返回错误
  if (!fs.existsSync(dir)) return { ok: false, msg: 'Skill 不存在' };
  // 递归删除目录
  fs.rmSync(dir, { recursive: true, force: true });
  // 删除数据库中的启用状态记录
  getDb().prepare('DELETE FROM user_skills WHERE id = ?').run(id);
  return { ok: true };
}

/**
 * 切换 Skill 的启用/禁用状态
 * @param id - Skill ID
 * @param enabled - 是否启用
 */
export function toggleSkill(id: string, enabled: boolean): void {
  getDb().prepare(
    // ON CONFLICT 实现 UPSERT 逻辑
    "INSERT INTO user_skills (id, enabled) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET enabled = ?, updated_at = datetime('now')"
  ).run(id, enabled ? 1 : 0, enabled ? 1 : 0);
}

/**
 * 注册所有 Skill 相关的 IPC 处理函数
 * @param ipcMain - Electron 主进程 IPC 实例
 */
export function registerSkillHandlers(ipcMain: Electron.IpcMain): void {
  // 列出所有 Skill
  ipcMain.handle('skill:list', () => listSkills());
  // 获取单个 Skill
  ipcMain.handle('skill:get', (_, id: string) => getSkill(id));
  // 创建 Skill
  ipcMain.handle('skill:create', (_, { name, description, content }: { name: string; description: string; content: string }) => createSkill(name, description, content));
  // 更新 Skill
  ipcMain.handle('skill:update', (_, { id, name, description, content }: { id: string; name: string; description: string; content: string }) => updateSkill(id, name, description, content));
  // 删除 Skill
  ipcMain.handle('skill:delete', (_, id: string) => deleteSkill(id));
  // 切换 Skill 状态
  ipcMain.handle('skill:toggle', (_, { id, enabled }: { id: string; enabled: boolean }) => toggleSkill(id, enabled));
}
