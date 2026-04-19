import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../database';
import { SKILLS_PATH } from '../config';

/**
 * Skills 管理器：扫描 ~/.claude/skills/ 目录，管理 SKILL.md
 */

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  content: string;
  frontmatter: string;
  hasAgents: boolean;
  hasReferences: boolean;
  hasScripts: boolean;
  subdirs: string[];
  enabled: boolean;
}

function ensureSkillsDir(): void {
  if (!fs.existsSync(SKILLS_PATH)) {
    fs.mkdirSync(SKILLS_PATH, { recursive: true });
  }
}

function parseFrontmatter(md: string): { frontmatter: string; name: string; description: string; content: string } {
  const match = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: '', name: '', description: '', content: md };
  }
  const [, fm, body] = match;
  const nameMatch = fm.match(/name:\s*(.+)/);
  const descMatch = fm.match(/description:\s*(.+)/);
  return {
    frontmatter: fm.trim(),
    name: nameMatch ? nameMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : '',
    content: body.trim(),
  };
}

function buildFrontmatter(name: string, description: string): string {
  return `name: ${name}\ndescription: ${description}`;
}

function listSkillIds(): string[] {
  ensureSkillsDir();
  try {
    return fs.readdirSync(SKILLS_PATH).filter(d => fs.statSync(path.join(SKILLS_PATH, d)).isDirectory());
  } catch {
    return [];
  }
}

function getSkillEnabled(id: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT enabled FROM user_skills WHERE id = ?').get(id) as { enabled: number } | undefined;
  return row ? row.enabled === 1 : true;
}

export function listSkills(): SkillInfo[] {
  const ids = listSkillIds();
  return ids
    .map(id => {
      const skillPath = path.join(SKILLS_PATH, id, 'SKILL.md');
      if (!fs.existsSync(skillPath)) return null;
      const md = fs.readFileSync(skillPath, 'utf-8');
      const { frontmatter, name, description, content } = parseFrontmatter(md);
      const entries = fs.readdirSync(path.join(SKILLS_PATH, id));
      const subdirs = entries.filter(e => fs.statSync(path.join(SKILLS_PATH, id, e)).isDirectory());
      return {
        id,
        name: name || id,
        description,
        content,
        frontmatter,
        hasAgents: entries.includes('agents'),
        hasReferences: entries.includes('references'),
        hasScripts: entries.includes('scripts'),
        subdirs,
        enabled: getSkillEnabled(id),
      };
    })
    .filter((s): s is SkillInfo => s !== null);
}

export function getSkill(id: string): SkillInfo | null {
  const skillPath = path.join(SKILLS_PATH, id, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  const md = fs.readFileSync(skillPath, 'utf-8');
  const { frontmatter, name, description, content } = parseFrontmatter(md);
  const entries = fs.readdirSync(path.join(SKILLS_PATH, id));
  const subdirs = entries.filter(e => fs.statSync(path.join(SKILLS_PATH, id, e)).isDirectory());
  return {
    id,
    name: name || id,
    description,
    content,
    frontmatter,
    hasAgents: entries.includes('agents'),
    hasReferences: entries.includes('references'),
    hasScripts: entries.includes('scripts'),
    subdirs,
    enabled: getSkillEnabled(id),
  };
}

export function createSkill(name: string, description: string, content: string): { ok: boolean; id: string; msg?: string } {
  ensureSkillsDir();
  // 生成 slug
  const id = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  if (!id) return { ok: false, id: '', msg: '名称无效' };

  const dir = path.join(SKILLS_PATH, id);
  if (fs.existsSync(dir)) return { ok: false, id: '', msg: 'Skill 已存在' };

  fs.mkdirSync(dir, { recursive: true });
  const md = `---\n${buildFrontmatter(name, description)}\n---\n\n${content}`;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), md, 'utf-8');
  return { ok: true, id };
}

export function updateSkill(id: string, name: string, description: string, content: string): { ok: boolean; msg?: string } {
  const dir = path.join(SKILLS_PATH, id);
  if (!fs.existsSync(dir)) return { ok: false, msg: 'Skill 不存在' };

  const skillPath = path.join(dir, 'SKILL.md');
  const md = `---\n${buildFrontmatter(name, description)}\n---\n\n${content}`;
  fs.writeFileSync(skillPath, md, 'utf-8');
  return { ok: true };
}

export function deleteSkill(id: string): { ok: boolean; msg?: string } {
  const dir = path.join(SKILLS_PATH, id);
  if (!fs.existsSync(dir)) return { ok: false, msg: 'Skill 不存在' };

  fs.rmSync(dir, { recursive: true, force: true });
  const db = getDb();
  db.prepare('DELETE FROM user_skills WHERE id = ?').run(id);
  return { ok: true };
}

export function toggleSkill(id: string, enabled: boolean): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO user_skills (id, enabled) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET enabled = ?, updated_at = datetime('now')"
  ).run(id, enabled ? 1 : 0, enabled ? 1 : 0);
}

export function registerSkillHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('skill:list', () => listSkills());
  ipcMain.handle('skill:get', (_, id: string) => getSkill(id));
  ipcMain.handle('skill:create', (_, { name, description, content }: { name: string; description: string; content: string }) => createSkill(name, description, content));
  ipcMain.handle('skill:update', (_, { id, name, description, content }: { id: string; name: string; description: string; content: string }) => updateSkill(id, name, description, content));
  ipcMain.handle('skill:delete', (_, id: string) => deleteSkill(id));
  ipcMain.handle('skill:toggle', (_, { id, enabled }: { id: string; enabled: boolean }) => toggleSkill(id, enabled));
}
