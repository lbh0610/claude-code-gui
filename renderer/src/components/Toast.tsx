import { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warn';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
});

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, type, message }]);
    // 3 秒后自动移除
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timersRef.current.delete(id);
    }, 3000);
    timersRef.current.set(id, timer);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback((type: ToastType, message: string) => addToast(type, message), [addToast]);
  const success = useCallback((m: string) => addToast('success', m), [addToast]);
  const error = useCallback((m: string) => addToast('error', m), [addToast]);
  const info = useCallback((m: string) => addToast('info', m), [addToast]);
  const warn = useCallback((m: string) => addToast('warn', m), [addToast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warn }}>
      {children}
      {/* Toast 渲染区域 */}
      <div style={{
        position: 'fixed', top: 60, right: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      }}>
        {toasts.map((t) => {
          const colors = {
            success: { bg: 'rgba(0,230,118,0.15)', border: 'rgba(0,230,118,0.4)', text: '#00e676' },
            error: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#ef4444' },
            info: { bg: 'rgba(0,229,255,0.15)', border: 'rgba(0,229,255,0.4)', text: '#00e5ff' },
            warn: { bg: 'rgba(255,152,0,0.15)', border: 'rgba(255,152,0,0.4)', text: '#ff9800' },
          };
          const c = colors[t.type];
          const icons = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
          return (
            <div
              key={t.id}
              onClick={() => removeToast(t.id)}
              style={{
                pointerEvents: 'auto',
                padding: '8px 14px',
                borderRadius: 8,
                background: 'var(--bg-card)',
                border: `1px solid ${c.border}`,
                color: c.text,
                fontSize: 13,
                fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                maxWidth: 360,
                animation: 'toast-in 0.2s ease',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700 }}>{icons[t.type]}</span>
              <span style={{ flex: 1 }}>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
