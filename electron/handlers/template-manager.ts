// Prompt 模板管理
import { getDb } from '../database';
import { addLog } from './log-manager';

interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  prompt: string;
  icon: string;
  created_at: string;
  updated_at: string;
}

export function listTemplates(category?: string): PromptTemplate[] {
  const db = getDb();
  if (category) {
    return db.prepare('SELECT * FROM prompt_templates WHERE category = ? ORDER BY name').all(category) as PromptTemplate[];
  }
  return db.prepare('SELECT * FROM prompt_templates ORDER BY category, name').all() as PromptTemplate[];
}

export function getTemplate(id: string): PromptTemplate | null {
  return getDb().prepare('SELECT * FROM prompt_templates WHERE id = ?').get(id) as PromptTemplate | null;
}

export function createTemplate(data: { name: string; description?: string; category?: string; prompt: string; icon?: string }): { ok: boolean; id?: string; msg?: string } {
  if (!data.name || !data.prompt) return { ok: false, msg: '名称和内容不能为空' };
  const db = getDb();
  const id = data.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  if (!id) return { ok: false, msg: '名称无效' };
  db.prepare('INSERT INTO prompt_templates (id, name, description, category, prompt, icon) VALUES (?, ?, ?, ?, ?, ?)').run(id, data.name, data.description || null, data.category || 'custom', data.prompt, data.icon || '📋');
  addLog('template', 'info', 'template_created', `模板已创建: ${data.name}`);
  return { ok: true, id };
}

export function deleteTemplate(id: string): { ok: boolean; msg?: string } {
  // 不允许删除内置模板
  if (!id.startsWith('custom-')) {
    const builtIn = ['code-review', 'bug-fix', 'refactor', 'test-gen', 'explain-code', 'write-doc', 'api-design', 'perf-optimize'];
    if (builtIn.includes(id)) return { ok: false, msg: '内置模板不可删除' };
  }
  getDb().prepare('DELETE FROM prompt_templates WHERE id = ?').run(id);
  return { ok: true };
}

export function applyTemplate(id: string, variables: Record<string, string>): { ok: boolean; result?: string; msg?: string } {
  const template = getTemplate(id);
  if (!template) return { ok: false, msg: '模板不存在' };
  let result = template.prompt;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return { ok: true, result };
}

export function registerTemplateHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('template:list', (_, category?: string) => listTemplates(category));
  ipcMain.handle('template:get', (_, id: string) => getTemplate(id));
  ipcMain.handle('template:create', (_, data: { name: string; description?: string; category?: string; prompt: string; icon?: string }) => createTemplate(data));
  ipcMain.handle('template:delete', (_, id: string) => deleteTemplate(id));
  ipcMain.handle('template:apply', (_, { id, variables }: { id: string; variables: Record<string, string> }) => applyTemplate(id, variables));
}
