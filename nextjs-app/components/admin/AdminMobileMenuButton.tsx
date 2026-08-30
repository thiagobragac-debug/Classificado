'use client'

import { useEffect, useState } from 'react'

// BUG CORRIGIDO (achado de usabilidade, 2026-08-29): o CSS do admin já
// previa modo mobile pra sidebar (.adm-sidebar { transform: translateX(-100%) }
// / .open { transform: translateX(0) }, ver admin-v2.css), mas nenhum botão
// ou estado em lugar nenhum controlava essa classe — em telas <768px a
// sidebar ficava 100% fora da tela e o admin não tinha NENHUMA navegação.
// app/(admin)/layout.tsx é server component, então o toggle mora aqui num
// client component à parte que manipula a classe do DOM diretamente via
// querySelector (mesma ideia de "portal" leve, sem precisar reestruturar o
// layout inteiro em client component só por causa do menu mobile).
export default function AdminMobileMenuButton() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const sidebar = document.querySelector('.adm-sidebar')
    sidebar?.classList.toggle('open', open)
    return () => { sidebar?.classList.remove('open') }
  }, [open])

  // Fecha o menu ao navegar (clique em qualquer link/botão dentro da sidebar,
  // ex. "Sair") e trava o scroll do body enquanto aberto, mesmo padrão do
  // menu mobile público (components/Header.tsx).
  useEffect(() => {
    if (!open) return
    const sidebar = document.querySelector('.adm-sidebar')
    const closeOnClick = (e: Event) => {
      if ((e.target as HTMLElement).closest('a, button')) setOpen(false)
    }
    sidebar?.addEventListener('click', closeOnClick)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      sidebar?.removeEventListener('click', closeOnClick)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        className={`adm-mobile-menu-btn${open ? ' open' : ''}`}
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={open}
        aria-controls="adm-sidebar"
        onClick={() => setOpen(o => !o)}
      >
        <span></span><span></span><span></span>
      </button>
      {open && (
        <div
          className="adm-mobile-overlay"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  )
}
