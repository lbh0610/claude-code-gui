import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../database';
import { SKILLS_PATH } from '../config';

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  content: string;
  subdirs: string[];
  enabled: boolean;
}

function parseSkill(id: string): SkillInfo | null {
  const dir = path.join(SKILLS_PATH, id);
  const skillPath = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  const md = fs.readFileSync(skillPath, 'utf-8');
  const match = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fm = match ? match[1] : '';
  const nameMatch = fm.match(/name:\s*(.+)/);
  const descMatch = fm.match(/description:\s*(.+)/);
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

function getSkillEnabled(id: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT enabled FROM user_skills WHERE id = ?').get(id) as { enabled: number } | undefined;
  return row ? row.enabled === 1 : true;
}

export function listSkills(): SkillInfo[] {
  if (!fs.existsSync(SKILLS_PATH)) fs.mkdirSync(SKILLS_PATH, { recursive: true });
  try {
    return fs.readdirSync(SKILLS_PATH)
      .filter(d => fs.statSync(path.join(SKILLS_PATH, d)).isDirectory())
      .map(parseSkill)
      .filter((s): s is SkillInfo => s !== null);
  } catch {
    return [];
  }
}

export function getSkill(id: string): SkillInfo | null {
  return parseSkill(id);
}

export function createSkill(name: string, description: string, content: string): { ok: boolean; id: string; msg?: string } {
  if (!fs.existsSync(SKILLS_PATH)) fs.mkdirSync(SKILLS_PATH, { recursive: true });
  const id = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  if (!id) return { ok: false, id: '', msg: '名称无效' };
  const dir = path.join(SKILLS_PATH, id);
  if (fs.existsSync(dir)) return { ok: false, id: '', msg: 'Skill 已存在' };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}`, 'utf-8');
  return { ok: true, id };
}

export function updateSkill(id: string, name: string, description: string, content: string): { ok: boolean; msg?: string } {
  const dir = path.join(SKILLS_PATH, id);
  if (!fs.existsSync(dir)) return { ok: false, msg: 'Skill 不存在' };
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}`, 'utf-8');
  return { ok: true };
}

export function deleteSkill(id: string): { ok: boolean; msg?: string } {
  const dir = path.join(SKILLS_PATH, id);
  if (!fs.existsSync(dir)) return { ok: false, msg: 'Skill 不存在' };
  fs.rmSync(dir, { recursive: true, force: true });
  getDb().prepare('DELETE FROM user_skills WHERE id = ?').run(id);
  return { ok: true };
}

export function toggleSkill(id: string, enabled: boolean): void {
  getDb().prepare(
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
