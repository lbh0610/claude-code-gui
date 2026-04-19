// Prompt 模板选择器组件
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  prompt: string;
  icon: string;
}

interface TemplatePickerProps {
  onInsert: (text: string) => void;
}

export default function TemplatePicker({ onInsert }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState('all');

  // 加载模板
  useEffect(() => {
    api.template.list().then(t => setTemplates(t as Template[])).catch(() => {});
  }, []);

  // 点击模板时显示变量填写表单
  const handleSelectTemplate = useCallback(async (template: Template) => {
    // 提取模板中的变量占位符
    const varMatches = template.prompt.match(/\{\{(\w+)\}\}/g) || [];
    const vars = [...new Set(varMatches.map(v => v.slice(2, -2)))];

    if (vars.length === 0) {
      // 没有变量，直接插入
      onInsert(template.prompt);
      setShowModal(false);
      return;
    }

    setSelectedTemplate(template.id);
    const initVars: Record<string, string> = {};
    for (const v of vars) initVars[v] = '';
    setVariables(initVars);
  }, [onInsert]);

  // 应用模板，替换变量
  const handleApply = useCallback(async () => {
    if (!selectedTemplate) return;
    const result = await api.template.apply({ id: selectedTemplate, variables });
    if (result.ok && result.result) {
      onInsert(result.result);
      setShowModal(false);
      setSelectedTemplate(null);
      setVariables({});
    }
  }, [selectedTemplate, variables, onInsert]);

  // 获取所有分类
  const categories = ['all', ...new Set(templates.map(t => t.category))];
  const filtered = activeCategory === 'all' ? templates : templates.filter(t => t.category === activeCategory);

  return (
    <>
      {/* 模板快捷栏 */}
      <div style={{
        padding: '4px 16px', borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-card)', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: '24px' }}>模板:</span>
        {templates.slice(0, 6).map(t => (
          <button key={t.id} onClick={() => handleSelectTemplate(t)}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11, padding: '2px 8px' }}>
            {t.icon} {t.name}
          </button>
        ))}
        {templates.length > 6 && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(true)}
            style={{ fontSize: 11, padding: '2px 8px' }}>
            更多...
          </button>
        )}
      </div>

      {/* 模板库 Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: 0, maxWidth: 600, width: '90%', maxHeight: 500,
            border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Prompt 模板库</h3>
              <button className="btn btn-sm" onClick={() => setShowModal(false)} style={{ fontSize: 14, color: 'var(--text-dim)' }}>✕</button>
            </div>

            {/* 分类标签 */}
            <div style={{ display: 'flex', gap: 6, padding: '8px 20px', borderBottom: '1px solid var(--border-color)' }}>
              {categories.map(c => (
                <button key={c} onClick={() => setActiveCategory(c)}
                  className={`btn btn-sm ${activeCategory === c ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 11, padding: '2px 10px', textTransform: 'capitalize' }}>
                  {c === 'all' ? '全部' : c}
                </button>
              ))}
            </div>

            {/* 模板列表 */}
            <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {filtered.map(t => (
                <div key={t.id} onClick={() => handleSelectTemplate(t)}
                  style={{
                    padding: 12, borderRadius: 8, cursor: 'pointer',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(0,0,0,0.02)',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--cyan)')}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{t.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t.description || ''}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 变量填写 Modal */}
      {selectedTemplate && Object.keys(variables).length > 0 && (
        <div onClick={() => { setSelectedTemplate(null); setVariables({}); }} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: 24, maxWidth: 400, width: '90%',
            border: '1px solid var(--border-color)',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
              填写变量
            </h3>
            {Object.entries(variables).map(([key, val]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>
                  {key}
                </label>
                <input className="input" value={val} onChange={(e) => setVariables({ ...variables, [key]: e.target.value })}
                  placeholder={`输入 ${key} 的值`} autoFocus={Object.keys(variables).indexOf(key) === 0} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedTemplate(null); setVariables({}); }}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleApply}
                disabled={Object.values(variables).some(v => !v.trim())}>插入</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
