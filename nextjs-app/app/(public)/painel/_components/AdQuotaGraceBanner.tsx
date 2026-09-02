'use client';

import React, { useState } from 'react';
import useSWR, { mutate as mutateGlobal } from 'swr';
import { getAdQuotaPending, getMyAds, applyAdQuotaGraceSelection } from '@/lib/supabase';
import { showToast } from '@/lib/toast';
import { useLang } from '@/lib/lang-context';
import styles from '../painel.module.css';

// Banner da janela de graça de downgrade — ver
// supabase/migrations/20260901110000_grace_period_pausa_anuncios_excedentes.sql.
// Só renderiza algo quando existe uma pendência real (ad_quota_pending tem
// linha pro usuário atual); nunca pausa nada sozinho — só manda a escolha do
// usuário pra apply_ad_quota_grace_selection(), que faz a validação de dono/
// quantidade de verdade no banco.
const TRANSLATIONS = {
  pt: {
    title: (max: number) => `Seu plano agora permite ${max} anúncio${max === 1 ? '' : 's'} ativo${max === 1 ? '' : 's'}`,
    body: (count: number, max: number) => `Você tem ${count} anúncios ativos, ${count - max} a mais que o novo limite. Escolha até ${max} para manter ativos — os demais pausam automaticamente em`,
    selectedCount: (n: number, max: number) => `${n} / ${max} selecionados`,
    confirm: 'Confirmar seleção',
    confirming: 'Salvando...',
    autoNotice: 'Se você não escolher a tempo, pausamos os anúncios mais antigos primeiro e mantemos os mais recentes ativos.',
    success: 'Seleção salva! Os anúncios fora da escolha foram pausados.',
    error: 'Erro ao salvar sua seleção.',
    tooMany: (max: number) => `Selecione no máximo ${max}.`,
  },
  es: {
    title: (max: number) => `Tu plan ahora permite ${max} anuncio${max === 1 ? '' : 's'} activo${max === 1 ? '' : 's'}`,
    body: (count: number, max: number) => `Tienes ${count} anuncios activos, ${count - max} más que el nuevo límite. Elige hasta ${max} para mantener activos — los demás se pausan automáticamente el`,
    selectedCount: (n: number, max: number) => `${n} / ${max} seleccionados`,
    confirm: 'Confirmar selección',
    confirming: 'Guardando...',
    autoNotice: 'Si no eliges a tiempo, pausamos primero los anuncios más antiguos y mantenemos activos los más recientes.',
    success: '¡Selección guardada! Los anuncios fuera de la elección fueron pausados.',
    error: 'Error al guardar tu selección.',
    tooMany: (max: number) => `Selecciona como máximo ${max}.`,
  },
} as const;

function fDeadline(iso: string, lang: string) {
  return new Date(iso).toLocaleDateString(lang === 'es' ? 'es-AR' : 'pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

export function AdQuotaGraceBanner({ userId }: { userId: string }) {
  const { lang } = useLang();
  const t = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: pending, mutate: mutatePending } = useSWR(['adQuotaPending', userId], getAdQuotaPending);
  const { data: activeAdsData } = useSWR(
    pending ? ['adQuotaActiveAds', userId] : null,
    () => getMyAds({ status: 'active', limit: 100 })
  );

  if (!pending) return null;

  const activeAds = activeAdsData?.data || [];
  const max = pending.max_ads;

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= max) {
          showToast(t.tooMany(max), 'warning');
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await applyAdQuotaGraceSelection(Array.from(selected));
      showToast(t.success, 'success');
      await mutatePending();
      mutateGlobal(['myAds']);
      mutateGlobal(['adStats', userId]);
    } catch (err: any) {
      showToast(err?.message || t.error, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '1rem',
      padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
    }}>
      <p style={{ fontWeight: 700, color: '#92400e', marginBottom: '0.35rem' }}>
        {t.title(max)}
      </p>
      <p style={{ fontSize: '0.9rem', color: '#78350f', marginBottom: '1rem' }}>
        {t.body(activeAds.length, max)} <strong>{fDeadline(pending.deadline, lang)}</strong>.
        <br />
        <span style={{ fontSize: '0.82rem' }}>{t.autoNotice}</span>
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        {activeAds.map((ad: any) => (
          <label key={ad.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            padding: '0.6rem 0.75rem', borderRadius: '0.6rem',
            background: selected.has(ad.id) ? '#fef3c7' : '#fffefb',
            border: '1px solid #fde68a', cursor: 'pointer', fontSize: '0.9rem',
          }}>
            <input
              type="checkbox"
              checked={selected.has(ad.id)}
              onChange={() => toggle(ad.id)}
            />
            {/* BUG CORRIGIDO (teste de estresse final, 2026-09-02): único
                componente do fluxo de graça de downgrade que ainda mostrava
                o título do anúncio sempre em português, mesmo com lang='es'
                e title_es já disponível no dado. */}
            <span style={{ color: '#78350f' }}>{lang === 'es' && ad.title_es ? ad.title_es : ad.title_pt}</span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving}
          className={styles.primaryButton}
        >
          {saving ? t.confirming : t.confirm}
        </button>
        <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 600 }}>
          {t.selectedCount(selected.size, max)}
        </span>
      </div>
    </div>
  );
}
