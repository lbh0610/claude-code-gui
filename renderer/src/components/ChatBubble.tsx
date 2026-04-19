import { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface ChatBubbleProps {
  message: ChatMessage;
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);

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
        {/* 复制按钮（仅 AI 气泡） */}
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

        <div className="chat-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
