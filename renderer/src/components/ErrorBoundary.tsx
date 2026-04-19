// 引入 React 组件类和类型
import { Component, ErrorInfo, ReactNode } from 'react';

// 组件属性接口
interface Props {
  fallback?: ReactNode;  // 自定义降级 UI
  children: ReactNode;   // 子节点
}

// 组件状态接口
interface State {
  hasError: boolean;  // 是否捕获到错误
  error: Error | null; // 错误对象
}

// 错误边界组件：捕获子树渲染错误，防止整个应用崩溃
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    // 初始化状态：无错误
    this.state = { hasError: false, error: null };
  }

  // 静态方法：从错误更新状态
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  // 实例方法：捕获错误后记录日志
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
  }

  render(): ReactNode {
    // 有错误时显示降级 UI
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          padding: 16,
          margin: 8,
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          fontSize: 13,
        }}>
          <div style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>
            渲染异常
          </div>
          <details style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            <summary>查看错误</summary>
            <pre style={{ marginTop: 8, overflow: 'auto', maxHeight: 100 }}>
              {this.state.error?.message}
            </pre>
          </details>
        </div>
      );
    }
    // 无错误时正常渲染子节点
    return this.props.children;
  }
}
