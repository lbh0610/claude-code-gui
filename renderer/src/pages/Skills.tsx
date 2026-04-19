import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../lib/api';

interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  subdirs: string[];
  enabled: boolean;
}

const emptyForm = { name: '', desc: '', content: '' };

export default function Skills() {
  const [skills, setSkills] = useState<{ id: string; name: string; description: string; enabled: boolean }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Skill | null>(null);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadSkills(); }, []);

  const loadSkills = async () => {
    setSkills(await api.skill.list());
  };

  const handleSelect = useCallback(async (id: string) => {
    setSelectedId(id);
    setMode('view');
    setDetail(await api.skill.get(id));
  }, []);

  const filtered = skills.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase())
  );

  const doSave = async () => {
    if (!selectedId || !form.name.trim()) return;
    setSaving(true);
    try {
      if (mode === 'new') {
        const result = await api.skill.create({ name: form.name.trim(), description: form.desc.trim(), content: form.content.trim() });
        if (result.ok) {
          setMode('view'); setForm(emptyForm);
          await loadSkills();
          await handleSelect(result.id);
        }
      } else {
        await api.skill.update({ id: selectedId, name: form.name, description: form.desc, content: form.content });
        setMode('view');
        await handleSelect(selectedId);
        await loadSkills();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此 Skill？此操作不可恢复。')) return;
    await api.skill.delete(id);
    if (selectedId === id) { setSelectedId(null); setDetail(null); }
    await loadSkills();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await api.skill.toggle(id, enabled);
    await loadSkills();
    if (detail && id === detail.id) {
      setDetail({ ...detail, enabled });
    }
  };

  const startEdit = () => {
    if (!detail) return;
    setForm({ name: detail.name, desc: detail.description, content: detail.content });
    setMode('edit');
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧：Skill 列表 */}
      <div style={{ width: 260, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--cyan)' }}>Skills 管理</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" placeholder="搜索 Skills..." value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', flex: 1 }} />
            <button className="btn btn-primary btn-sm" onClick={() => { setMode('new'); setForm(emptyForm); }}
              title="新建 Skill" style={{ padding: '4px 10px', fontSize: 12 }}>+ 新建</button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 16, textAlign: 'center' }}>
              {search ? '无匹配 Skill' : '暂无 Skills'}
            </div>
          ) : (
            filtered.map((s) => (
              <div key={s.id} onClick={() => handleSelect(s.id)} style={{
                padding: '8px 12px', cursor: 'pointer', borderRadius: 6, marginBottom: 2,
                background: s.id === selectedId ? 'rgba(0,229,255,0.08)' : 'transparent',
                borderLeft: s.id === selectedId ? '3px solid var(--cyan)' : '3px solid transparent',
                opacity: s.enabled ? 1 : 0.5,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: s.id === selectedId ? 'var(--cyan)' : 'var(--text-primary)' }}>
                  {s.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.description || s.id}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: 8, borderTop: '1px solid var(--border-color)', fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
          共 {skills.length} 个 Skill
        </div>
      </div>

      {/* 右侧：详情 / 编辑 / 新建 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {mode !== 'view' ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--cyan)' }}>
                {mode === 'new' ? '新建 Skill' : '编辑'}
              </h2>
              <button className="btn btn-secondary btn-sm" onClick={() => { setMode('view'); setForm(emptyForm); }}>取消</button>
            </div>
            <div style={{ maxWidth: 700 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                {mode === 'new' ? '名称 *' : '名称'}
              </label>
              <input className="input" placeholder="my-skill" value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                style={{ marginBottom: 12 }} />
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>描述</label>
              <input className="input" placeholder="当用户想要...时使用此 Skill" value={form.desc}
                onChange={(e) => setForm(prev => ({ ...prev, desc: e.target.value }))}
                style={{ marginBottom: 12 }} />
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>内容 (Markdown)</label>
              <textarea className="input" placeholder="# Skill 指令&#10;&#10;在这里编写 Skill 的指令内容..."
                value={form.content}
                onChange={(e) => setForm(prev => ({ ...prev, content: e.target.value }))}
                rows={14}
                style={{ marginBottom: 16, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6, resize: 'vertical' }} />
              <button className="btn btn-primary" onClick={doSave} disabled={saving || !form.name.trim()}>
                {saving ? '保存中...' : (mode === 'new' ? '创建' : '保存')}
              </button>
            </div>
          </div>
        ) : detail ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{detail.name}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{detail.id}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={detail.enabled} onChange={(e) => handleToggle(detail.id, e.target.checked)} />
                  已启用
                </label>
                <button className="btn btn-secondary btn-sm" onClick={startEdit}>编辑</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(detail.id)}>删除</button>
              </div>
            </div>

            {detail.description && (
              <div style={{ marginBottom: 20, padding: 12, background: 'rgba(0,229,255,0.05)', borderRadius: 6, border: '1px solid rgba(0,229,255,0.15)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>描述</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{detail.description}</div>
              </div>
            )}

            {detail.subdirs.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>包含目录</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {detail.subdirs.map(d => (
                    <span key={d} style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 4,
                      background: d === 'agents' ? 'rgba(124,77,255,0.1)' : d === 'references' ? 'rgba(0,230,118,0.1)' : 'rgba(0,229,255,0.1)',
                      color: d === 'agents' ? 'var(--purple)' : d === 'references' ? 'var(--success)' : 'var(--cyan)',
                    }}>📁 {d}</span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>内容</div>
              <div style={{ padding: 16, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 13, lineHeight: 1.7 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: 80, color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>★</div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>选择一个 Skill 查看或编辑</div>
            <div style={{ fontSize: 13 }}>或点击左侧"新建"按钮创建新 Skill</div>
          </div>
        )}
      </div>
    </div>
  );
}
