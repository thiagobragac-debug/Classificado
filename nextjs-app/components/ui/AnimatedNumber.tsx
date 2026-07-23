'use client';

import { useEffect, useState, useRef } from 'react';

export function AnimatedNumber({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  
  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      let start = 0;
      const dur = 1500;
      const step = (timestamp: number) => {
        if (!start) start = timestamp;
        const prog = Math.min((timestamp - start) / dur, 1);
        const ease = 1 - Math.pow(1 - prog, 3);
        setVal(Math.round(ease * target));
        if (prog < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);

  const display = val >= 1000 ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k` : String(val);
  return <span ref={ref}>{display}{suffix}</span>;
}
