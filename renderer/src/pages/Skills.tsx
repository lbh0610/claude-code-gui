import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../lib/api';

interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  hasAgents: boolean;
  hasReferences: boolean;
  hasScripts: boolean;
  subdirs: string[];
  enabled: boolean;
}

export default function Skills() {
  const [skills, setSkills] = useState<{ id: string; name: string; description: string; enabled: boolean }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Skill | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    const data = await api.skill.list();
    setSkills(data);
  };

  const handleSelect = useCallback(async (id: string) => {
    setSelectedId(id);
    setEditing(false);
    const skill = await api.skill.get(id);
    setDetail(skill);
  }, []);

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.skill.update({ id: selectedId, name: editName, description: editDesc, content: editContent });
      setEditing(false);
      await handleSelect(selectedId);
      await loadSkills();
    } finally {
      setSaving(false);
    }
  };

  const handleNew = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const result = await api.skill.create({ name: newName.trim(), description: newDesc.trim(), content: newContent.trim() });
      if (result.ok) {
        setShowNewForm(false);
        setNewName(''); setNewDesc(''); setNewContent('');
        await loadSkills();
        await handleSelect(result.id);
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
    if (selectedId === id) {
      const skill = await api.skill.get(id);
      setDetail(skill);
    }
  };

  const startEdit = () => {
    if (!detail) return;
    setEditName(detail.name);
    setEditDesc(detail.description);
    setEditContent(detail.content);
    setEditing(true);
  };

  const filtered = skills.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧：Skill 列表 */}
      <div style={{ width: 260, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--cyan)' }}>
            Skills 管理
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="搜索 Skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', flex: 1 }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowNewForm(true)}
              title="新建 Skill"
              style={{ padding: '4px 10px', fontSize: 12 }}
            >
              + 新建
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 16, textAlign: 'center' }}>
              {search ? '无匹配 Skill' : '暂无 Skills'}
            </div>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                onClick={() => handleSelect(s.id)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: 6,
                  marginBottom: 2,
                  background: s.id === selectedId ? 'rgba(0,229,255,0.08)' : 'transparent',
                  borderLeft: s.id === selectedId ? '3px solid var(--cyan)' : '3px solid transparent',
                  opacity: s.enabled ? 1 : 0.5,
                }}
              >
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

      {/* 右侧：详情 / 编辑 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {/* 新建表单 */}
        {showNewForm && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--cyan)' }}>新建 Skill</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowNewForm(false)}>取消</button>
            </div>
            <div style={{ maxWidth: 700 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>名称 *</label>
              <input className="input" placeholder="my-skill" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ marginBottom: 12 }} />
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>描述</label>
              <input className="input" placeholder="当用户想要...时使用此 Skill" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} style={{ marginBottom: 12 }} />
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>内容 (Markdown)</label>
              <textarea
                className="input"
                placeholder="# Skill 指令&#10;&#10;在这里编写 Skill 的指令内容..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={12}
                style={{ marginBottom: 16, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6, resize: 'vertical' }}
              />
              <button className="btn btn-primary" onClick={handleNew} disabled={saving || !newName.trim()}>
                {saving ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        )}

        {/* 详情 */}
        {!showNewForm && detail && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {editing ? editName : detail.name}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {detail.id}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* 启用开关 */}
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={detail.enabled}
                    onChange={(e) => handleToggle(detail.id, e.target.checked)}
                  />
                  已启用
                </label>
                {!editing ? (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={startEdit}>编辑</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(detail.id)}>删除</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>取消</button>
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {editing ? (
              <div style={{ maxWidth: 700 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>名称</label>
                <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ marginBottom: 12 }} />
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>描述</label>
                <input className="input" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={{ marginBottom: 12 }} />
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>内容 (Markdown)</label>
                <textarea
                  className="input"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={16}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6, resize: 'vertical' }}
                />
              </div>
            ) : (
              <div>
                {detail.description && (
                  <div style={{ marginBottom: 20, padding: 12, background: 'rgba(0,229,255,0.05)', borderRadius: 6, border: '1px solid rgba(0,229,255,0.15)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>描述</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{detail.description}</div>
                  </div>
                )}

                {/* 子目录 */}
                {detail.subdirs.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>包含目录</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {detail.subdirs.map(d => (
                        <span key={d} style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 4,
                          background: d === 'agents' ? 'rgba(124,77,255,0.1)' : d === 'references' ? 'rgba(0,230,118,0.1)' : 'rgba(0,229,255,0.1)',
                          color: d === 'agents' ? 'var(--purple)' : d === 'references' ? 'var(--success)' : 'var(--cyan)',
                        }}>
                          📁 {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 内容预览 */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>内容</div>
                  <div style={{
                    padding: 16, background: 'var(--bg-card)', borderRadius: 8,
                    border: '1px solid var(--border-color)', fontSize: 13, lineHeight: 1.7,
                  }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {detail.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 空状态 */}
        {!showNewForm && !detail && (
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
