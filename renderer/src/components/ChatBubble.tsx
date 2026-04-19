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
  onReady?: () => void;
}

export default function ChatBubble({ message, onReady }: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  const [stepsExpanded, setStepsExpanded] = useState(true);

  useEffect(() => {
    // 有完整回复时自动收起思考和步骤
    if (message.thinking) {
      setThinkingExpanded(false);
      onReady?.();
    }
    if (message.toolSteps && message.toolSteps.length > 0) {
      setStepsExpanded(false);
    }
  }, [message.thinking, message.toolSteps]);

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
        }}
      >
        {/* 复制按钮 */}
        {!isUser && (
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

        {/* 思考过程（可展开/收起） */}
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
              {thinkingExpanded ? '收起思考过程' : '展开思考过程'}
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
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.thinking}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* 执行步骤（可展开/收起） */}
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
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 3,
                    }}>
                      <span className={`status-dot ${step.status === 'done' ? 'running' : 'idle'}`} />
                      <span style={{ color: 'var(--cyan)', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
                        {step.name}
                      </span>
                      <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-sans)' }}>
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
        <div className="chat-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
