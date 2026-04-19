import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  toolSteps?: { name: string; input: Record<string, unknown>; output?: string; status: 'running' | 'done' }[];
  timestamp: number;
}

interface ChatBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onReady?: () => void;
}

export default function ChatBubble({ message, isStreaming, onReady }: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);
  // 流式消息：思考和步骤默认展开（实时更新中）
  // 非流式（最终结果）：自动收起
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  const [stepsExpanded, setStepsExpanded] = useState(true);

  useEffect(() => {
    if (!isStreaming && message.thinking) {
      // 非流式 + 有思考内容 → 自动收起
      setThinkingExpanded(false);
      onReady?.();
    } else if (isStreaming) {
      // 流式中 → 保持展开，让用户实时看到
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

  if (message.role === 'system') {
    return (
      <div style={{ textAlign: 'center', padding: '4px 0', fontSize: 11, color: 'var(--text-dim)' }}>
        {message.content}
      </div>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUser = message.role === 'user';
  const hasThinking = !!message.thinking;
  const hasSteps = !!message.toolSteps && message.toolSteps.length > 0;
  const hasContent = !!message.content;

  // 流式状态下无内容时，显示加载指示
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
        }}
      >
        {/* 复制按钮 */}
        {!isUser && !isStreaming && (
          <button
            className="btn-copy"
            onClick={handleCopy}
            style={{
              position: 'absolute',
              top: 6,
              right: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              fontSize: 11,
              cursor: 'pointer',
              opacity: 0.6,
            }}
          >
            {copied ? '✓' : '📋'}
          </button>
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
                background: 'rgba(0, 230, 118, 0.08)',
                border: '1px solid rgba(0, 230, 118, 0.2)',
                borderRadius: 6,
                padding: '4px 10px',
                color: 'var(--success)',
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
