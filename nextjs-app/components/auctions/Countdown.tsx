'use client';

import { useState, useEffect, useRef } from 'react';
import { useLang } from '@/lib/lang-context';
import styles from '@/app/(public)/leiloes/leiloes.module.css';

interface CountdownProps {
  targetDateStr: string;
  // BUG CORRIGIDO (achado de usabilidade, leilões): quando o contador chega a
  // zero, quem estiver ouvindo (ex.: AuctionsBrowser) precisa saber pra
  // buscar o status atualizado do evento (o servidor é quem decide quando
  // status vira 'live') — sem isso, a página ficava com o badge "AGENDADO"
  // parado até um F5 manual, mesmo com o leilão já começando.
  onExpire?: () => void;
}

// BUG CORRIGIDO (auditoria de i18n, 2026-08-26/27): labels DIAS/HORAS/MIN/SEG
// ficavam fixos em português mesmo com ES selecionado.
const LABELS = {
  pt: { days: 'DIAS', hours: 'HORAS', min: 'MIN', sec: 'SEG', starting: 'Iniciando…' },
  es: { days: 'DÍAS', hours: 'HORAS', min: 'MIN', sec: 'SEG', starting: 'Comenzando…' },
} as const;

export default function Countdown({ targetDateStr, onExpire }: CountdownProps) {
  const { lang } = useLang();
  const L = LABELS[lang as keyof typeof LABELS] || LABELS.pt;
  const [timeNow, setTimeNow] = useState<Date | null>(null);
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    setTimeNow(new Date());
    const interval = setInterval(() => setTimeNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Nullable enquanto timeNow ainda não hidratou — usado só pelo efeito de
  // onExpire abaixo, que precisa ficar antes de qualquer `return` condicional
  // (hooks não podem ser condicionais).
  const diffOrNull = timeNow ? new Date(targetDateStr).getTime() - timeNow.getTime() : null;

  // BUG CORRIGIDO (achado de usabilidade, leilões): dispara onExpire uma
  // única vez, no instante em que o diff cruza pra <=0.
  useEffect(() => {
    if (diffOrNull !== null && diffOrNull <= 0 && !hasExpiredRef.current) {
      hasExpiredRef.current = true;
      onExpire?.();
    }
  }, [diffOrNull, onExpire]);

  if (!timeNow) return null; // Avoid hydration mismatch

  // A partir daqui timeNow é garantidamente não-nulo — recalcula um `diff`
  // não-nulável (mais simples pro TS do que estreitar diffOrNull).
  const diff = new Date(targetDateStr).getTime() - timeNow.getTime();

  if (diff <= 0) {
    // BUG CORRIGIDO (achado de usabilidade, leilões): antes retornava null
    // aqui — o cronômetro simplesmente sumia (área em branco) assim que o
    // leilão começava, até um novo fetch trazer o status 'live' do servidor.
    // Mostra "Iniciando…" nesse intervalo em vez de deixar a área vazia.
    return (
      <div className={styles.countdownContainer}>
        <div className={styles.countdownItem}>
          <div className={styles.countdownBox}>
            <div className={styles.countdownValue} style={{ fontSize: '1.1rem', color: 'white' }}>
              {L.starting}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const m = Math.floor((diff / 1000 / 60) % 60);
  const s = Math.floor((diff / 1000) % 60);

  return (
    <div className={styles.countdownContainer}>
      {[
        { label: L.days, value: d },
        { label: L.hours, value: h },
        { label: L.min, value: m },
        { label: L.sec, value: s, color: '#ef4444' }
      ].map((item, i) => (
        <div key={i} className={styles.countdownItem}>
          <div className={styles.countdownBox}>
            <div 
              className={styles.countdownValue} 
              style={{ color: item.color || 'white' }}
            >
              {item.value.toString().padStart(2, '0')}
            </div>
          </div>
          <div 
            className={styles.countdownLabel} 
            style={{ color: item.color || 'var(--clr-primary)' }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
