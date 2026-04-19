// 知识库/RAG 管理
import fs from 'node:fs';
import { getDb } from '../database';
import { addLog } from './log-manager';

interface KnowledgeDoc {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface SearchResult {
  doc: KnowledgeDoc;
  score: number;
}

/**
 * 添加文档到知识库
 */
export function addDocument(data: { title: string; content: string; category?: string; tags?: string[] }): { ok: boolean; id?: number; msg?: string } {
  if (!data.title || !data.content) return { ok: false, msg: '标题和内容不能为空' };
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO knowledge_docs (title, content, category, tags) VALUES (?, ?, ?, ?)'
  ).run(data.title, data.content, data.category || 'general', JSON.stringify(data.tags || []));
  const docId = result.lastInsertRowid as number;

  // 构建简易倒排索引（按词频）
  const terms = tokenize(data.title + ' ' + data.content);
  const insertTerm = db.prepare('INSERT INTO knowledge_index (doc_id, term, frequency) VALUES (?, ?, ?)');
  const termFreq = new Map<string, number>();
  for (const term of terms) {
    termFreq.set(term, (termFreq.get(term) || 0) + 1);
  }
  for (const [term, freq] of termFreq) {
    insertTerm.run(docId, term, freq);
  }

  addLog('knowledge', 'info', 'doc_added', `文档已添加: ${data.title}`);
  return { ok: true, id: docId };
}

/**
 * 列出知识库文档
 */
export function listDocuments(category?: string): KnowledgeDoc[] {
  const db = getDb();
  if (category) {
    return db.prepare('SELECT * FROM knowledge_docs WHERE category = ? ORDER BY updated_at DESC').all(category) as KnowledgeDoc[];
  }
  return db.prepare('SELECT * FROM knowledge_docs ORDER BY updated_at DESC').all() as KnowledgeDoc[];
}

/**
 * 获取单个文档
 */
export function getDocument(id: number): KnowledgeDoc | null {
  return getDb().prepare('SELECT * FROM knowledge_docs WHERE id = ?').get(id) as KnowledgeDoc | null;
}

/**
 * 删除文档
 */
export function deleteDocument(id: number): { ok: boolean; msg?: string } {
  const db = getDb();
  db.prepare('DELETE FROM knowledge_index WHERE doc_id = ?').run(id);
  db.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(id);
  addLog('knowledge', 'info', 'doc_deleted', `文档已删除: id=${id}`);
  return { ok: true };
}

/**
 * 更新文档
 */
export function updateDocument(id: number, data: { title: string; content: string; category?: string; tags?: string[] }): { ok: boolean; msg?: string } {
  const db = getDb();
  db.prepare(
    "UPDATE knowledge_docs SET title = ?, content = ?, category = ?, tags = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(data.title, data.content, data.category || 'general', JSON.stringify(data.tags || []), id);

  // 重建索引
  db.prepare('DELETE FROM knowledge_index WHERE doc_id = ?').run(id);
  const doc = getDocument(id);
  if (doc) {
    const terms = tokenize(doc.title + ' ' + doc.content);
    const insertTerm = db.prepare('INSERT INTO knowledge_index (doc_id, term, frequency) VALUES (?, ?, ?)');
    const termFreq = new Map<string, number>();
    for (const term of terms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }
    for (const [term, freq] of termFreq) {
      insertTerm.run(id, term, freq);
    }
  }

  return { ok: true };
}

/**
 * 搜索知识库（基于 TF-IDF 的简易检索）
 * @param query - 搜索关键词
 * @param category - 可选分类
 * @param limit - 返回结果数
 */
export function searchKnowledge(query: string, category?: string, limit = 5): SearchResult[] {
  const db = getDb();
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  // 查询包含搜索词的文档
  const categoryFilter = category ? 'AND kd.category = ?' : '';
  const rows = db.prepare(`
    SELECT kd.*, ki.term, ki.frequency
    FROM knowledge_docs kd
    INNER JOIN knowledge_index ki ON kd.id = ki.doc_id
    WHERE ki.term IN (${queryTerms.map(() => '?').join(',')})
    ${categoryFilter}
    ORDER BY ki.frequency DESC
  `).all(...queryTerms, ...(category ? [category] : [])) as (KnowledgeDoc & { term: string; frequency: number })[];

  // 计算 TF-IDF 得分
  const totalDocs = db.prepare('SELECT COUNT(*) as cnt FROM knowledge_docs').get() as { cnt: number };
  const docScores = new Map<number, number>();
  for (const row of rows) {
    const idf = Math.log(totalDocs.cnt / (queryTerms.includes(row.term) ? 1 : totalDocs.cnt));
    const tf = 1 + Math.log(row.frequency);
    const score = tf * idf;
    docScores.set(row.id, (docScores.get(row.id) || 0) + score);
  }

  // 排序并返回
  const results: SearchResult[] = [];
  const sorted = Array.from(docScores.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
  for (const [id, score] of sorted) {
    const doc = getDocument(id);
    if (doc) results.push({ doc, score: Math.round(score * 100) / 100 });
  }
  return results;
}

/**
 * 简单分词（支持中英文）
 */
function tokenize(text: string): string[] {
  // 英文按空格和标点分词
  const enTerms = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  // 中文按双字符组合分词（简易 n-gram）
  const zhTerms: string[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    const c1 = text[i];
    const c2 = text[i + 1];
    if (/[\u4e00-\u9fff]/.test(c1) && /[\u4e00-\u9fff]/.test(c2)) {
      zhTerms.push(c1 + c2);
    }
  }
  // 也加入单字
  const singleChars = text.match(/[\u4e00-\u9fff]/g) || [];
  return [...enTerms, ...zhTerms, ...singleChars].filter(t => t.length >= 1);
}

/**
 * 从文件导入文档
 */
export function importFromFile(filePath: string, category?: string): { ok: boolean; msg?: string } {
  if (!fs.existsSync(filePath)) return { ok: false, msg: '文件不存在' };
  const content = fs.readFileSync(filePath, 'utf-8');
  const title = filePath.split('/').pop() || filePath;
  return addDocument({ title, content, category });
}

export function registerKnowledgeHandlers(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('knowledge:add', (_, data: { title: string; content: string; category?: string; tags?: string[] }) => addDocument(data));
  ipcMain.handle('knowledge:list', (_, category?: string) => listDocuments(category));
  ipcMain.handle('knowledge:get', (_, id: number) => getDocument(id));
  ipcMain.handle('knowledge:delete', (_, id: number) => deleteDocument(id));
  ipcMain.handle('knowledge:update', (_, data: { id: number; title: string; content: string; category?: string; tags?: string[] }) => updateDocument(data.id, data));
  ipcMain.handle('knowledge:search', (_, { query, category, limit }: { query: string; category?: string; limit?: number }) => searchKnowledge(query, category, limit || 5));
  ipcMain.handle('knowledge:import', (_, { filePath, category }: { filePath: string; category?: string }) => importFromFile(filePath, category));
}
