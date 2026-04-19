import { useState } from 'react';

interface AttachedImage {
  id: string;
  name: string;
  dataUrl: string;
}

interface ImagePreviewProps {
  images: AttachedImage[];
  onRemove: (id: string) => void;
}

export default function ImagePreview({ images, onRemove }: ImagePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <div style={{
        display: 'flex',
        gap: 8,
        padding: '6px 16px',
        flexWrap: 'wrap',
      }}>
        {images.map(img => (
          <div
            key={img.id}
            style={{
              position: 'relative',
              width: 64,
              height: 64,
              borderRadius: 6,
              overflow: 'hidden',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onClick={() => setPreviewUrl(img.dataUrl)}
          >
            <img
              src={img.dataUrl}
              alt={img.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(img.id); }}
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                fontSize: 10,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
              title="移除图片"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* 大图预览 */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={previewUrl}
            alt="Preview"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              borderRadius: 8,
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            }}
          />
        </div>
      )}
    </>
  );
}

export type { AttachedImage };
