'use client'

import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { getSupabase, logout } from '@/lib/supabase'

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any | null>(null)
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

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
        logout(); // Safe logout via Supabase, redirects to /?logout=success
      }, TIMEOUT_MS);
    };

    const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    
    // Initial start
    timer = setTimeout(() => {
      logout();
    }, TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ session, user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
