import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[];
  timestamp: number;
  id?: number;
  cost?: number;
  duration?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

interface ChatBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onReady?: () => void;
  onDelete?: () => void;
  messageId?: number;
}

export default function ChatBubble({ message, isStreaming, onReady, onDelete }: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  const [stepsExpanded, setStepsExpanded] = useState(true);

  useEffect(() => {
    if (!isStreaming && message.thinking) {
      setThinkingExpanded(false);
      onReady?.();
    } else if (isStreaming) {
      setThinkingExpanded(true);
      setStepsExpanded(true);
    }
  }, [message.thinking, isStreaming]);

  useEffect(() => {
    if (!isStreaming && message.toolSteps?.length) {
      setStepsExpanded(false);
    } else if (isStreaming) {
      setStepsExpanded(true);
    }
  }, [message.toolSteps?.length, isStreaming]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  // 系统消息
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

  const isUser = message.role === 'user';
  const hasThinking = !!message.thinking;
  const hasSteps = !!message.toolSteps && message.toolSteps.length > 0;
  const hasContent = !!message.content;

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

        {/* 思考过程 */}
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

        {/* 执行步骤 */}
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

        {/* 正文内容 */}
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

        {/* Token 和费用信息 */}
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

function formatNum(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

/** 带复制按钮的代码块 */
function CodeBlock({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  const [copied, setCopied] = useState(false);
  const isInline = !className;
  const code = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isInline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  const language = className.replace('language-', '');

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
