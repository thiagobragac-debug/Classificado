'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Play, X, Grid } from 'lucide-react';
import { imageUrl } from '@/lib/storage';

const FALLBACK_IMG = '/assets/hero_farm.webp';

interface AdGalleryProps {
  images: string[] | null;
  videoUrl: string | null;
  title: string;
}

export function AdGallery({ images, videoUrl, title }: AdGalleryProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  const media: { type: 'video' | 'image'; url: string }[] = [];
  if (videoUrl) media.push({ type: 'video', url: videoUrl });
  (images || []).forEach(img => media.push({ type: 'image', url: imageUrl(img) }));
  if (media.length === 0) media.push({ type: 'image', url: FALLBACK_IMG });

  const totalMedia = media.length;

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIdx((prev) => (prev - 1 + totalMedia) % totalMedia);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIdx((prev) => (prev + 1) % totalMedia);
  };

  const openLightbox = (idx: number) => {
    setCurrentIdx(idx);
    setShowLightbox(true);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setShowLightbox(false);
    document.body.style.overflow = 'auto';
  };

  // BUG CORRIGIDO (teste completo do site, 2026-08-24): sem handler de
  // Escape, o teclado não fechava o lightbox — a única saída era o botão X,
  // que por sua vez ficava geometricamente inalcançável (ver comentário no
  // JSX do lightbox abaixo).
  useEffect(() => {
    if (!showLightbox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showLightbox]);

  return (
    <>
      <div className="gallery-main-wrapper" style={{ position: 'relative' }}>
        {/* DESKTOP GRID */}
        {totalMedia >= 3 && (
          <div className="gallery-airbnb-grid">
            {/* Imagem Principal */}
            <div 
              style={{ gridRow: 'span 2', position: 'relative', cursor: 'pointer', overflow: 'hidden' }}
              onClick={() => openLightbox(0)}
              className="gallery-grid-item"
            >
              {media[0].type === 'video' ? (
                <div style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'#1e293b'}}>
                  <Play className="w-16 h-16 text-white opacity-80" />
                </div>
              ) : (
                <Image src={media[0].url} alt={title} fill style={{ objectFit: 'cover' }} priority />
              )}
            </div>

            {/* Imagens secundárias */}
            {media.slice(1, 5).map((item, idx) => (
              <div 
                key={idx}
                style={{ position: 'relative', cursor: 'pointer', overflow: 'hidden', backgroundColor: '#1e293b' }}
                onClick={() => openLightbox(idx + 1)}
                className="gallery-grid-item"
              >
                {item.type === 'video' ? (
                   <div style={{width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'white'}}>
                     <Play className="w-8 h-8 opacity-80" />
                   </div>
                ) : (
                  <Image src={item.url} alt={`${title} ${idx + 1}`} fill style={{ objectFit: 'cover' }} />
                )}
              </div>
            ))}

            {/* Botão Ver todas */}
            {totalMedia > 5 && (
              <button 
                onClick={() => openLightbox(0)}
                className="btn btn-outline"
                style={{ position: 'absolute', bottom: '1rem', right: '1rem', background: 'white', zIndex: 10, display: 'flex', gap: '0.5rem', alignItems: 'center' }}
              >
                <Grid className="w-4 h-4"/> Ver todas as {totalMedia} fotos
              </button>
            )}
          </div>
        )}

        {/* MOBILE CAROUSEL */}
        <div 
          className={totalMedia >= 3 ? "gallery-mobile-carousel" : ""}
          style={{ 
            position: 'relative', 
            width: '100%', 
            backgroundColor: '#1e293b',
            borderRadius: '1rem',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--clr-border)',
            minHeight: '400px',
            cursor: 'pointer'
          }}
          onClick={() => openLightbox(currentIdx)}
        >
          {totalMedia > 1 && (
            <>
              <button 
                className="gallery-nav-btn prev visible" 
                onClick={handlePrev} 
                aria-label="Imagem anterior"
                style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
              >
                <ChevronLeft className="w-6 h-6 text-slate-800" />
              </button>
              <button 
                className="gallery-nav-btn next visible" 
                onClick={handleNext} 
                aria-label="Próxima imagem"
                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
              >
                <ChevronRight className="w-6 h-6 text-slate-800" />
              </button>
            </>
          )}

          {media[currentIdx].type === 'video' ? (
            <video
              src={media[currentIdx].url} 
              controls
              style={{ width: '100%', height: 'auto', maxHeight: '500px', objectFit: 'contain' }}
            />
          ) : (
            <Image
              src={media[currentIdx].url}
              alt={`${title} - Imagem ${currentIdx + 1}`}
              width={1200}
              height={900}
              style={{ width: '100%', height: 'auto', maxHeight: '500px', objectFit: 'contain', display: 'block', margin: 'auto' }}
              priority
            />
          )}
        </div>
      </div>

      {/* LIGHTBOX — renderizado via portal em document.body: .ad-main-content
          (globals.css) tem position:relative + z-index:10, o que cria um
          stacking context próprio. Um position:fixed daqui de dentro tem seu
          z-index comparado DENTRO desse contexto (nível 10), não contra o
          documento inteiro — por isso o header do site (z-index:1000, fora
          desse contexto) sempre desenhava por cima, e o botão de fechar
          ficava geometricamente inalcançável por clique. O portal escapa
          desse aninhamento por completo. */}
      {showLightbox && typeof document !== 'undefined' && createPortal(
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed',
            top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.95)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
          <button
            onClick={closeLightbox}
            aria-label="Fechar"
            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', zIndex: 10000 }}
          >
            <X className="w-8 h-8" />
          </button>

          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: '1200px', height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {totalMedia > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); handlePrev(); }} style={{ position: 'absolute', left: '2rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', zIndex: 10 }}>
                  <ChevronLeft className="w-10 h-10" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleNext(); }} style={{ position: 'absolute', right: '2rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', zIndex: 10 }}>
                  <ChevronRight className="w-10 h-10" />
                </button>
              </>
            )}

            {media[currentIdx].type === 'video' ? (
              <video src={media[currentIdx].url} controls style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <img src={media[currentIdx].url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            )}
          </div>
          
          <div style={{ color: 'white', marginTop: '1rem', fontSize: '1.1rem' }}>
            {currentIdx + 1} / {totalMedia}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
