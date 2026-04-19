// 文件浏览器 + 代码预览组件
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface FileEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  path: string;
  size: number;
}

interface FileTreeProps {
  dirPath: string;
  onSelectFile: (filePath: string, content: string) => void;
}

interface FileTreeNode extends FileEntry {
  children?: FileTreeNode[];
  loaded: boolean;
}

// 文件类型图标映射
const FILE_ICONS: Record<string, string> = {
  '.ts': '🔷', '.tsx': '⚛️', '.js': '📜', '.jsx': '⚛️', '.py': '🐍',
  '.go': '🔵', '.rs': '🦀', '.java': '☕', '.rb': '💎', '.php': '🐘',
  '.css': '🎨', '.scss': '🎨', '.html': '🌐', '.json': '📋', '.yaml': '📋',
  '.yml': '📋', '.md': '📝', '.sql': '🗃️', '.sh': '⚙️', '.toml': '⚙️',
  '.env': '🔒', '.gitignore': '📁', 'Dockerfile': '🐳', 'README': '📖',
};

function getFileIcon(name: string): string {
  const ext = '.' + name.split('.').pop()?.toLowerCase();
  if (FILE_ICONS[name]) return FILE_ICONS[name];
  return FILE_ICONS[ext] || '📄';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 递归目录节点
function TreeNode({ entry, depth, onSelectFile }: { entry: FileTreeNode; depth: number; onSelectFile: (path: string, content: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [children, setChildren] = useState<FileTreeNode[]>(entry.children || []);

  const handleExpand = useCallback(async () => {
    if (!entry.isDirectory) return;
    if (children.length > 0) { setExpanded(!expanded); return; }
    setLoading(true);
    try {
      const items = await api.fs.readdir(entry.path) as FileEntry[];
      // 目录排前面，按名称排序
      const sorted = items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      }).map(item => ({ ...item, children: [], loaded: false }));
      setChildren(sorted);
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  }, [entry, children.length, expanded]);

  const handleSelectFile = useCallback(async () => {
    if (entry.isFile) {
      try {
        const content = await api.fs.readFile(entry.path) as string;
        onSelectFile(entry.path, content);
      } catch { /* 忽略错误 */ }
    }
  }, [entry, onSelectFile]);

  const paddingLeft = depth * 16 + 8;

  return (
    <div>
      <div
        onClick={entry.isDirectory ? handleExpand : handleSelectFile}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', cursor: 'pointer', fontSize: 12,
          paddingLeft,
          whiteSpace: 'nowrap',
        }}
        title={entry.path}
      >
        <span style={{ width: 14, textAlign: 'center', flexShrink: 0, fontSize: 10, color: 'var(--text-dim)' }}>
          {entry.isDirectory ? (loading ? '⟳' : expanded ? '▾' : '▸') : ''}
        </span>
        <span style={{ fontSize: 13, flexShrink: 0 }}>{getFileIcon(entry.name)}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
        {entry.isFile && entry.size > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto', flexShrink: 0 }}>{formatSize(entry.size)}</span>
        )}
      </div>
      {expanded && children.map((child, i) => (
        <TreeNode key={child.path + i} entry={child} depth={depth + 1} onSelectFile={onSelectFile} />
      ))}
    </div>
  );
}

// 简易代码预览（带行号）
function CodePreview({ filePath, content, onClose }: { filePath: string; content: string; onClose: () => void }) {
  const lines = content.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-card)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {filePath.split('/').pop()}
        </span>
        <button className="btn btn-sm" onClick={onClose} style={{ fontSize: 10, padding: '2px 6px', color: 'var(--text-dim)' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, lineHeight: 1.6 }}>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', borderBottom: '1px solid rgba(128,128,128,0.05)' }}>
            <span style={{
              width: 40, textAlign: 'right', paddingRight: 12, flexShrink: 0,
              color: 'var(--text-dim)', userSelect: 'none', background: 'rgba(128,128,128,0.03)',
            }}>{i + 1}</span>
            <pre style={{ margin: 0, flex: 1, whiteSpace: 'pre', overflow: 'auto', userSelect: 'text' }}>{line}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FileExplorer({ dirPath }: FileTreeProps) {
  const [rootNodes, setRootNodes] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string } | null>(null);

  const loadRoot = useCallback(async () => {
    if (!dirPath) return;
    setLoading(true);
    try {
      const items = await api.fs.readdir(dirPath) as FileEntry[];
      const sorted = items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      }).map(item => ({ ...item, children: [], loaded: false }));
      setRootNodes(sorted);
    } finally {
      setLoading(false);
    }
  }, [dirPath]);

  // 目录变化时重新加载
  useEffect(() => { loadRoot(); }, [dirPath, loadRoot]);

  if (!dirPath) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
        请先选择项目目录
      </div>
    );
  }

  if (previewFile) {
    return (
      <CodePreview
        filePath={previewFile.path}
        content={previewFile.content}
        onClose={() => setPreviewFile(null)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>文件浏览器</span>
        <button className="btn btn-sm" onClick={loadRoot} style={{ fontSize: 10, padding: '2px 6px', color: 'var(--cyan)' }}>↻ 刷新</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>加载中...</div>
        ) : rootNodes.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>空目录</div>
        ) : (
          rootNodes.map((node, i) => (
            <TreeNode key={node.path + i} entry={node} depth={0} onSelectFile={(path, content) => setPreviewFile({ path, content })} />
          ))
        )}
      </div>
    </div>
  );
}
