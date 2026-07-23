'use client';

import { useState, useEffect } from 'react';
import styles from '@/app/(public)/leiloes/leiloes.module.css';

interface CountdownProps {
  targetDateStr: string;
}

export default function Countdown({ targetDateStr }: CountdownProps) {
  const [timeNow, setTimeNow] = useState<Date | null>(null);

  useEffect(() => {
    setTimeNow(new Date());
    const interval = setInterval(() => setTimeNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!timeNow) return null; // Avoid hydration mismatch

  const diff = new Date(targetDateStr).getTime() - timeNow.getTime();
  if (diff <= 0) return null;

  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const m = Math.floor((diff / 1000 / 60) % 60);
  const s = Math.floor((diff / 1000) % 60);

  return (
    <div className={styles.countdownContainer}>
      {[
        { label: 'DIAS', value: d },
        { label: 'HORAS', value: h },
        { label: 'MIN', value: m },
        { label: 'SEG', value: s, color: '#ef4444' }
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
