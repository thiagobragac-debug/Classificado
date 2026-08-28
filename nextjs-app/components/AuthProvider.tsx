'use client'

import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { getSupabase, logout } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useLang } from '@/lib/lang-context'

type AuthContextType = {
  session: any | null
  user: any | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true
})

const INACTIVITY_TOAST = {
  pt: 'Sua sessão expirou por inatividade. Faça login novamente.',
  es: 'Tu sesión expiró por inactividad. Inicia sesión nuevamente.',
} as const

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLang()
  const [session, setSession] = useState<any | null>(null)
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  // BUG CORRIGIDO (varredura cruzada de cenários): logout() sempre redirecionava
  // pra "/" sem nenhum parâmetro, apesar do comentário abaixo (agora corrigido)
  // dizer o contrário — um usuário desconectado por inatividade caía na home
  // sem nenhuma explicação. Lê o parâmetro que o logout('inactivity') agora
  // realmente envia e mostra um toast explicando o motivo.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('logout') === 'inactivity') {
      showToast(INACTIVITY_TOAST[lang], 'info')
      params.delete('logout')
      const query = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const supabase = getSupabase()

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // -- INACTIVITY TIMEOUT (1 Hour) --
  // BUG CORRIGIDO (varredura cruzada de cenários): dependia de `[user]`, o
  // objeto inteiro — trocado a cada evento do onAuthStateChange, incluindo
  // refresh de token em segundo plano, sem nenhuma interação real do
  // usuário. Cada refresh recriava o efeito do zero, reiniciando a janela
  // de 1h indefinidamente e nunca de fato encerrando a sessão por
  // inatividade. `user?.id` só muda em login/logout de verdade.
  useEffect(() => {
    if (!user) return; // Only track logged in users
    const TIMEOUT_MS = 60 * 60 * 1000;
    let timer: NodeJS.Timeout;
    let lastActivity = Date.now();

    const resetTimer = () => {
      const now = Date.now();
      // Throttle resets to max once every 10 seconds to save CPU
      if (now - lastActivity < 10000) return;
      lastActivity = now;

      clearTimeout(timer);
      timer = setTimeout(() => {
        console.warn('Sessão encerrada por inatividade (1 Hora).');
        logout('inactivity');
      }, TIMEOUT_MS);
    };

    const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));

    // Initial start
    timer = setTimeout(() => {
      logout('inactivity');
    }, TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{ session, user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
