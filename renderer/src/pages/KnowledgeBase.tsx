// 知识库/RAG 管理页面
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';

interface KnowledgeDoc {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export default function KnowledgeBase() {
  const toast = useToast();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ doc: KnowledgeDoc; score: number }[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetail, setShowDetail] = useState<KnowledgeDoc | null>(null);
  const [editingDoc, setEditingDoc] = useState<KnowledgeDoc | null>(null);

  // 表单字段
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formTags, setFormTags] = useState('');

  // 加载文档
  const loadDocs = useCallback(async (category?: string) => {
    const result = await api.knowledge.list(category) as KnowledgeDoc[];
    setDocs(result);
  }, []);

  useEffect(() => {
    loadDocs(activeCategory === 'all' ? undefined : activeCategory);
  }, [activeCategory, loadDocs]);

  // 搜索
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const results = await api.knowledge.search({ query: searchQuery, limit: 10 }) as { doc: KnowledgeDoc; score: number }[];
    setSearchResults(results);
  }, [searchQuery]);

  // 添加文档
  const handleAdd = useCallback(async () => {
    if (!formTitle || !formContent) { toast.error('标题和内容不能为空'); return; }
    const tags = formTags.split(',').map(t => t.trim()).filter(Boolean);
    const result = await api.knowledge.add({ title: formTitle, content: formContent, category: formCategory, tags });
    if (result.ok) {
      toast.success('文档已添加');
      setShowAddModal(false);
      setFormTitle('');
      setFormContent('');
      setFormCategory('general');
      setFormTags('');
      loadDocs(activeCategory === 'all' ? undefined : activeCategory);
    }
  }, [formTitle, formContent, formCategory, formTags, loadDocs, activeCategory, toast]);

  // 删除文档
  const handleDelete = useCallback(async (id: number) => {
    const result = await api.knowledge.delete(id);
    if (result.ok) {
      toast.success('文档已删除');
      setShowDetail(null);
      loadDocs(activeCategory === 'all' ? undefined : activeCategory);
    }
  }, [loadDocs, activeCategory, toast]);

  // 从文件导入
  const handleImport = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.json,.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = await api.knowledge.add({ title: file.name, content: text, category: formCategory });
      if (result.ok) {
        toast.success(`已导入: ${file.name}`);
        loadDocs(activeCategory === 'all' ? undefined : activeCategory);
      }
    };
    input.click();
  }, [formCategory, loadDocs, activeCategory, toast]);

  const categories = ['all', 'general', ...new Set(docs.map(d => d.category))];

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: 'var(--cyan)' }}>
        知识库 / RAG
      </h1>

      {/* 搜索栏 */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>搜索知识库</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="输入关键词搜索相关文档..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={handleSearch}>搜索</button>
        </div>

        {searchResults.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {searchResults.map((r, i) => (
              <div key={i} onClick={() => setShowDetail(r.doc)}
                style={{
                  padding: 10, borderRadius: 6, cursor: 'pointer', marginBottom: 6,
                  border: '1px solid var(--border-color)',
                  background: 'rgba(0,0,0,0.02)',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.doc.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--cyan)' }}>相关度: {r.score}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.doc.content.slice(0, 150)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 文档列表 */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>文档库 ({docs.length})</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleImport}>📁 导入文件</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ 添加文档</button>
          </div>
        </div>

        {/* 分类过滤 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setActiveCategory(c)}
              className={`btn btn-sm ${activeCategory === c ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 11, padding: '2px 10px' }}>
              {c === 'all' ? '全部' : c === 'general' ? '通用' : c}
            </button>
          ))}
        </div>

        {docs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>
            暂无文档，点击"添加文档"开始
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
            {docs.map(doc => (
              <div key={doc.id} onClick={() => setShowDetail(doc)}
                style={{
                  padding: 12, borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(0,0,0,0.02)',
                }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{doc.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.content.slice(0, 100)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                  {doc.category} · {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 文档详情 Modal */}
      {showDetail && (
        <div onClick={() => setShowDetail(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: 24, maxWidth: 600, width: '90%', maxHeight: '70vh',
            border: '1px solid var(--border-color)', overflow: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{showDetail.title}</h3>
              <button className="btn btn-sm" onClick={() => setShowDetail(null)} style={{ fontSize: 14, color: 'var(--text-dim)' }}>✕</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
              分类: {showDetail.category} · 标签: {showDetail.tags.join(', ') || '无'}
            </div>
            <pre style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13,
              lineHeight: 1.6, fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-primary)', userSelect: 'text',
            }}>{showDetail.content}</pre>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(showDetail.id)}>删除</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setEditingDoc(showDetail); setShowDetail(null); }}>编辑</button>
            </div>
          </div>
        </div>
      )}

      {/* 添加文档 Modal */}
      {showAddModal && (
        <div onClick={() => setShowAddModal(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: 24, maxWidth: 500, width: '90%',
            border: '1px solid var(--border-color)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>添加文档</h3>

            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>标题</label>
            <input className="input" value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
              placeholder="文档标题" style={{ marginBottom: 12 }} />

            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>内容</label>
            <textarea className="input" value={formContent} onChange={(e) => setFormContent(e.target.value)}
              placeholder="粘贴文档内容..." rows={8}
              style={{ marginBottom: 12, fontFamily: 'monospace', resize: 'vertical' }} />

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>分类</label>
                <input className="input" value={formCategory} onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="general" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>标签 (逗号分隔)</label>
                <input className="input" value={formTags} onChange={(e) => setFormTags(e.target.value)}
                  placeholder="tag1, tag2" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddModal(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd}>添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
