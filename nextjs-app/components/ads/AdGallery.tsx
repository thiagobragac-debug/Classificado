'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';

const FALLBACK_IMG = '/assets/hero_farm.webp';
const SB_STORAGE = 'https://rfzuzuobwuanmbrcthqe.supabase.co/storage/v1/object/public/ads-images/';

function imageUrl(path: string): string {
  if (!path) return FALLBACK_IMG;
  if (path.startsWith('http')) return path;
  return SB_STORAGE + path;
}

interface AdGalleryProps {
  images: string[] | null;
  videoUrl: string | null;
  title: string;
}

export function AdGallery({ images, videoUrl, title }: AdGalleryProps) {
  const [currentIdx, setCurrentIdx] = useState(0);

  const media: { type: 'video' | 'image'; url: string }[] = [];
  if (videoUrl) media.push({ type: 'video', url: videoUrl });
  (images || []).forEach(img => media.push({ type: 'image', url: imageUrl(img) }));
  if (media.length === 0) media.push({ type: 'image', url: FALLBACK_IMG });

  const totalMedia = media.length;

  const handlePrev = () => {
    setCurrentIdx((prev) => (prev - 1 + totalMedia) % totalMedia);
  };

  const handleNext = () => {
    setCurrentIdx((prev) => (prev + 1) % totalMedia);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setCurrentIdx(index);
    }
  };

  return (
    <div className="gallery-main-wrapper" style={{ position: 'relative' }}>
      {/* Imagem/Vídeo Principal */}
      <div 
        style={{ 
          position: 'relative', 
          width: '100%', 
          backgroundColor: '#ffffff',
          borderRadius: '1rem',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--clr-border)',
          minHeight: '300px'
        }}
      >
        {totalMedia > 1 && (
          <>
            <button 
              className="gallery-nav-btn prev visible" 
              onClick={handlePrev} 
              aria-label="Imagem anterior"
              style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'rgba(255,255,255,0.8)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}
            >
              <ChevronLeft className="w-6 h-6 text-slate-800" />
            </button>
            <button 
              className="gallery-nav-btn next visible" 
              onClick={handleNext} 
              aria-label="Próxima imagem"
              style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'rgba(255,255,255,0.8)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}
            >
              <ChevronRight className="w-6 h-6 text-slate-800" />
            </button>
          </>
        )}

        {media[currentIdx].type === 'video' ? (
          <video
            src={media[currentIdx].url} 
            controls
            style={{ width: '100%', height: 'auto', maxHeight: '600px', objectFit: 'contain' }}
          />
        ) : (
          <Image
            src={media[currentIdx].url}
            alt={`${title} - Imagem ${currentIdx + 1}`}
            width={1200}
            height={900}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 800px"
            style={{ width: '100%', height: 'auto', maxHeight: '600px', objectFit: 'contain', display: 'block', margin: 'auto' }}
            priority={currentIdx === 0}
          />
        )}
      </div>

      {/* Thumbnails */}
      {totalMedia > 1 && (
        <div 
          className="gallery-thumbs" 
          style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}
          role="tablist"
          aria-label="Miniaturas da galeria"
        >
          {media.map((item, idx) => {
            const isActive = idx === currentIdx;
            return (
              <div 
                key={idx}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                aria-label={`Visualizar mídia ${idx + 1}`}
                onClick={() => setCurrentIdx(idx)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                style={{ 
                  position: 'relative', 
                  width: 80, 
                  height: 80, 
                  flexShrink: 0, 
                  borderRadius: '0.75rem', 
                  overflow: 'hidden', 
                  cursor: 'pointer',
                  border: isActive ? '3px solid var(--clr-primary, #16A34A)' : '3px solid transparent',
                  opacity: isActive ? 1 : 0.6,
                  transition: 'all 0.2s ease',
                  backgroundColor: '#1e293b'
                }}
              >
                {item.type === 'video' ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <Play className="w-8 h-8 opacity-80" />
                  </div>
                ) : (
                  <Image 
                    src={item.url} 
                    alt={`Miniatura ${idx + 1}`} 
                    fill 
                    sizes="80px"
                    style={{ objectFit: 'cover' }} 
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
