import { useState, useEffect, useCallback } from 'react';
// 导入 Markdown 渲染库及插件
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

// 聊天消息的数据结构定义
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'; // 消息角色：用户/助手/系统
  content: string;                        // 消息正文内容
  thinking?: string;                      // 思考过程（可选）
  toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[]; // 工具调用步骤列表（可选）
  timestamp: number;                      // 消息时间戳
  id?: number;                            // 消息唯一ID（可选）
  cost?: number;                          // 调用费用（可选）
  duration?: number;                      // 响应耗时（可选）
  inputTokens?: number;                   // 输入 token 数量（可选）
  outputTokens?: number;                  // 输出 token 数量（可选）
  cacheCreationTokens?: number;           // 缓存创建 token 数量（可选）
  cacheReadTokens?: number;               // 缓存读取 token 数量（可选）
}

// ChatBubble 组件的 props 接口定义
interface ChatBubbleProps {
  message: ChatMessage;   // 要渲染的聊天消息
  isStreaming?: boolean;  // 是否处于流式输出状态（可选）
  onReady?: () => void;   // 消息渲染完成后的回调（可选）
  onDelete?: () => void;  // 删除消息的回调（可选）
  messageId?: number;     // 消息ID（可选）
}

// ChatBubble 主组件：渲染单条聊天消息气泡
export default function ChatBubble({ message, isStreaming, onReady, onDelete }: ChatBubbleProps) {
  // 复制按钮的状态：是否已复制
  const [copied, setCopied] = useState(false);
  // 思考过程区域的展开/折叠状态
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  // 执行步骤区域的展开/折叠状态
  const [stepsExpanded, setStepsExpanded] = useState(true);

  // 根据消息内容和流式状态自动调整思考区域的展开状态
  useEffect(() => {
    if (!isStreaming && message.thinking) {
      // 非流式且有思考内容时，默认折叠思考区域，并通知父组件已就绪
      setThinkingExpanded(false);
      onReady?.();
    } else if (isStreaming) {
      // 流式输出时保持展开
      setThinkingExpanded(true);
      setStepsExpanded(true);
    }
  }, [message.thinking, isStreaming]);

  // 根据工具步骤数量和流式状态自动调整执行步骤区域的展开状态
  useEffect(() => {
    if (!isStreaming && message.toolSteps?.length) {
      // 非流式且有工具步骤时，默认折叠
      setStepsExpanded(false);
    } else if (isStreaming) {
      // 流式输出时保持展开
      setStepsExpanded(true);
    }
  }, [message.toolSteps?.length, isStreaming]);

  // 复制消息正文到剪贴板的处理函数
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    // 2秒后重置复制状态
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  // 系统消息：居中显示，根据内容关键词自动匹配图标和颜色
  if (message.role === 'system') {
    const isInit = message.content.includes('已初始化') || message.content.includes('session_id');
    const isResult = message.content.includes('执行完成') || message.content.includes('耗时');
    const isError = message.content.includes('失败') || message.content.includes('错误') || message.content.includes('Error');
    const icon = isInit ? '⚙' : isResult ? '✓' : isError ? '✗' : '•';
    const color = isInit ? 'var(--cyan)' : isResult ? 'var(--success)' : isError ? 'var(--danger)' : 'var(--text-dim)';

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '6px 0',
        fontSize: 11,
        color,
      }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{
          background: 'rgba(0,0,0,0.2)',
          padding: '3px 12px',
          borderRadius: 12,
          border: `1px solid ${color}33`,
        }}>
          {message.content}
        </span>
      </div>
    );
  }

  // 判断消息类型和内容是否存在
  const isUser = message.role === 'user';
  const hasThinking = !!message.thinking;
  const hasSteps = !!message.toolSteps && message.toolSteps.length > 0;
  const hasContent = !!message.content;

  // 流式输出初期：没有任何内容时显示"思考中..."加载指示
  if (!hasContent && !hasThinking && !hasSteps && isStreaming) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '2px 0' }}>
        <div style={{
          padding: '10px 14px',
          maxWidth: '85%',
          color: 'var(--text-dim)',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span className="pulse-dot" />
          思考中...
        </div>
      </div>
    );
  }

  // 主渲染逻辑：根据角色决定对齐方向（用户消息靠右，助手消息靠左）
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        padding: '2px 0',
      }}
    >
      <div
        className={isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          position: 'relative',
          opacity: isStreaming ? 0.85 : 1,
          userSelect: 'text',
        }}
      >
        {/* 操作按钮 */}
        {!isStreaming && message.role !== 'system' && (
          <div style={{ position: 'absolute', top: 6, right: 8, display: 'flex', gap: 4 }}>
            {!isUser && (
              <button
                onClick={handleCopy}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-dim)',
                  fontSize: 11,
                  cursor: 'pointer',
                  opacity: 0.6,
                }}
                title="复制整条消息"
              >
                {copied ? '✓' : '📋'}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => { if (confirm('删除此消息？')) onDelete(); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-dim)',
                  fontSize: 11,
                  cursor: 'pointer',
                  opacity: 0.6,
                }}
                title="删除消息"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* 流式指示器 */}
        {isStreaming && (
          <div style={{
            position: 'absolute',
            top: 6,
            right: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'var(--text-dim)',
          }}>
            <span className="pulse-dot" />
          </div>
        )}

        {/* 思考过程区域 */}
        {hasThinking && (
          <div style={{ marginBottom: 8 }}>
            <button
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(124, 77, 255, 0.08)',
                border: '1px solid rgba(124, 77, 255, 0.2)',
                borderRadius: 6,
                padding: '4px 10px',
                color: 'var(--purple)',
                fontSize: 12,
                cursor: 'pointer',
                width: '100%',
                fontFamily: 'inherit',
              }}
            >
              <span style={{
                transform: thinkingExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
                fontSize: 10,
              }}>
                ▶
              </span>
              思考过程
              {isStreaming && <span style={{ fontSize: 10, opacity: 0.7 }}>（实时更新中）</span>}
            </button>
            {thinkingExpanded && (
              <div
                className="chat-content"
                style={{
                  marginTop: 6,
                  padding: '8px 12px',
                  background: 'rgba(124, 77, 255, 0.05)',
                  borderRadius: 6,
                  borderLeft: '3px solid rgba(124, 77, 255, 0.3)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.thinking}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* 执行步骤区域 */}
        {hasSteps && (
          <div style={{ marginBottom: 8 }}>
            <button
              onClick={() => setStepsExpanded(!stepsExpanded)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(0, 180, 220, 0.08)',
                border: '1px solid rgba(0, 180, 220, 0.2)',
                borderRadius: 6,
                padding: '4px 10px',
                color: 'var(--cyan-dim)',
                fontSize: 12,
                cursor: 'pointer',
                width: '100%',
                fontFamily: 'inherit',
              }}
            >
              <span style={{
                transform: stepsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
                fontSize: 10,
              }}>
                ▶
              </span>
              执行步骤 ({message.toolSteps!.length})
              {isStreaming && <span style={{ fontSize: 10, opacity: 0.7 }}>（实时更新中）</span>}
            </button>
            {stepsExpanded && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {message.toolSteps!.map((step, i) => (
                  <div
                    key={i}
                    className="code-block-wrapper"
                    style={{
                      padding: '6px 10px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span className={`status-dot ${step.status === 'done' ? 'running' : 'idle'}`} />
                      <span style={{ color: 'var(--cyan)', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
                        {step.name}
                      </span>
                      <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-sans)', fontSize: 11 }}>
                        {step.status === 'done' ? '完成' : '执行中'}
                      </span>
                    </div>
                    <div style={{
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      maxHeight: 80,
                      overflow: 'auto',
                    }}>
                      {typeof step.input.command === 'string'
                        ? step.input.command
                        : JSON.stringify(step.input).slice(0, 200)}
                    </div>
                    {step.output && (
                      <div style={{
                        marginTop: 4,
                        padding: '4px 8px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: 4,
                        color: 'var(--text-dim)',
                        fontSize: 11,
                        maxHeight: 60,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {step.output}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 正文内容：使用 Markdown 渲染 */}
        {hasContent && (
          <div className="chat-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                code: CodeBlock,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Token 用量和费用统计信息（仅助手消息） */}
        {!isUser && (message.cost !== undefined || message.inputTokens !== undefined || message.outputTokens !== undefined || message.duration !== undefined) && (
          <div style={{
            marginTop: 8,
            paddingTop: 6,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px 12px',
            fontSize: 11,
            color: 'var(--text-dim)',
          }}>
            {(message.inputTokens !== undefined || message.outputTokens !== undefined) && (
              <span>
                Tokens: ↓{formatNum(message.inputTokens ?? 0)} / ↑{formatNum(message.outputTokens ?? 0)}
                {((message.cacheCreationTokens ?? 0) + (message.cacheReadTokens ?? 0)) > 0 && (
                  <span style={{ opacity: 0.7 }}> (cache: +{formatNum((message.cacheCreationTokens ?? 0) + (message.cacheReadTokens ?? 0))})</span>
                )}
              </span>
            )}
            {message.cost !== undefined && <span>费用: ${message.cost.toFixed(4)}</span>}
            {message.duration !== undefined && message.duration > 0 && <span>耗时: {(message.duration / 1000).toFixed(1)}s</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// 数字格式化：超过1000时显示为 k 单位
function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// CodeBlock 子组件：渲染代码块，支持行内代码和块级代码，带复制按钮
function CodeBlock({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  // 复制按钮状态
  const [copied, setCopied] = useState(false);
  // 判断是否为行内代码（无 className 说明没有 language-xxx 类名）
  const isInline = !className;
  // 提取代码文本并去除末尾换行
  const code = String(children).replace(/\n$/, '');

  // 复制代码到剪贴板的处理函数
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 行内代码直接渲染，不添加额外结构
  if (isInline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  // 从 className 中提取语言名称（如 "language-javascript" -> "javascript"）
  const language = className.replace('language-', '');

  // 块级代码：渲染带语言标签和复制按钮的代码块
  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        {language && <span className="code-block-lang">{language}</span>}
        <button
          onClick={handleCopy}
          className="code-block-copy"
          title="复制代码"
        >
          {copied ? '✓ 已复制' : '📋 复制'}
        </button>
      </div>
      <code className={className} {...props}>
        {children}
      </code>
    </div>
  );
}
