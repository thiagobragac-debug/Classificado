'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateProfile, getSupabase } from '@/lib/supabase';
import { resendVerificationEmail, uploadKycDocument } from '@/lib/supabase-panel';
import { showToast } from '@/lib/toast';
import styles from '../painel.module.css';
import { Lock } from 'lucide-react';

const profileSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  display_name: z.string().optional(),
  phone_whatsapp: z.string().optional(),
  document_number: z.string().optional(),
  zip_code: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  bio: z.string().optional()
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export function ProfileTab({ user }: { user: any }) {
  const [saving, setSaving] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycStatus, setKycStatus] = useState<string | undefined>(user.profile?.kyc_status);

  // GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): "Banner de
  // perfil" é vendido pro Premium (has_banner) mas nunca teve tela de
  // upload — profiles.banner_url só era lido (perfil público), nunca
  // escrito por ninguém. O bucket `profile-banners` já existia provisionado.
  const [hasBannerPlan, setHasBannerPlan] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(user.profile?.banner_url || null);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadBannerPlan() {
      const sb = getSupabase();
      const { data: secrets } = await sb.from('user_secrets').select('plan_id').eq('id', user.id).maybeSingle();
      let planRow: { has_banner: boolean } | null = null;
      if (secrets?.plan_id) {
        const { data } = await sb.from('plans').select('has_banner').eq('id', secrets.plan_id).maybeSingle();
        planRow = data;
      }
      if (!planRow) {
        const { data } = await sb.from('plans').select('has_banner').eq('is_active', true).eq('price', 0).order('sort_order').limit(1).maybeSingle();
        planRow = data;
      }
      if (!cancelled) setHasBannerPlan(!!planRow?.has_banner);
    }
    if (user?.id) loadBannerPlan();
    return () => { cancelled = true };
  }, [user?.id]);

  const handleBannerUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Envie uma imagem (PNG, JPEG ou WebP).', 'error');
      return;
    }
    setUploadingBanner(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const sb = getSupabase();
      const { error: upErr } = await sb.storage.from('profile-banners').upload(path, file, { cacheControl: '31536000', upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = sb.storage.from('profile-banners').getPublicUrl(path);
      await updateProfile(user.id, { banner_url: publicUrl });
      setBannerUrl(publicUrl);
      showToast('Banner de perfil atualizado!', 'success');
    } catch (err: any) {
      showToast('Erro ao enviar banner: ' + (err.message || ''), 'error');
    } finally {
      setUploadingBanner(false);
    }
  };

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { country: 'BR' }
  });

  const country = watch('country');

  useEffect(() => {
    if (user?.profile) {
      reset({
        name: user.profile.name || '',
        display_name: user.profile.display_name || '',
        phone_whatsapp: user.profile.phone_whatsapp || '',
        document_number: user.profile.document_number || '',
        zip_code: user.profile.zip_code || '',
        street: user.profile.street || '',
        number: user.profile.number || '',
        complement: user.profile.complement || '',
        neighborhood: user.profile.neighborhood || '',
        city: user.profile.city || '',
        state: user.profile.state || '',
        country: user.profile.country || 'BR',
        bio: user.profile.bio || '',
      });
    }
  }, [user, reset]);

  const handleCep = async (e: React.FocusEvent<HTMLInputElement>) => {
    const cep = e.target.value.replace(/\D/g, '');
    if (cep.length === 8 && country === 'BR') {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setValue('street', data.logradouro || '');
          setValue('neighborhood', data.bairro || '');
          setValue('city', data.localidade || '');
          setValue('state', data.uf || '');
        }
      } catch { /* silent */ }
    }
  };

  const onSubmit = async (data: ProfileFormValues) => {
    setSaving(true);
    try {
      await updateProfile(user.id, data);
      showToast('Perfil salvo com sucesso!', 'success');
    } catch {
      showToast('Erro ao salvar perfil.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResendEmail = async () => {
    if (!user.email) return;
    try {
      await resendVerificationEmail(user.email);
      showToast('E-mail de confirmação reenviado!', 'success');
    } catch {
      showToast('Erro ao reenviar e-mail.', 'error');
    }
  };

  const handleKycSubmit = async () => {
    if (!docFile || !selfieFile) {
      showToast('Selecione os dois arquivos antes de enviar.', 'warning');
      return;
    }
    setKycLoading(true);
    try {
      await uploadKycDocument(docFile, selfieFile);
      showToast('Documentos enviados para análise!', 'success');
      if (user.profile) user.profile.kyc_status = 'pending';
      setKycStatus('pending');
    } catch {
      showToast('Erro ao enviar documentos.', 'error');
    } finally {
      setKycLoading(false);
    }
  };

  return (
    <div className={styles.fadeIn}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className={styles.headerTitle}>Meu Perfil</h1>
        <p className={styles.headerSubtitle}>Informações da sua conta</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'start' }} className="profile-two-col">
        {/* Formulário de Dados */}
        <div className={styles.card} style={{ padding: '1.5rem' }}>
          <p style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.06em', color: 'var(--clr-text-light)', textTransform: 'uppercase', marginBottom: '1rem' }}>Banner de Perfil</p>
          {!hasBannerPlan ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.9rem 1rem', background: 'var(--clr-bg-alt)', borderRadius: '.75rem', color: 'var(--clr-text-muted)', fontSize: '.88rem', marginBottom: '1.5rem' }}>
              <Lock size={16} />
              Banner de perfil é um recurso do plano Premium. <a href="/planos" style={{ color: 'var(--clr-primary)', fontWeight: 600 }}>Fazer upgrade</a>
            </div>
          ) : (
            <div style={{ marginBottom: '1.5rem' }}>
              {bannerUrl && (
                <img src={bannerUrl} alt="Banner do perfil" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: '.75rem', marginBottom: '.75rem' }} />
              )}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.6rem 1.1rem', border: '1.5px dashed var(--clr-border-light)', borderRadius: '.75rem', cursor: uploadingBanner ? 'not-allowed' : 'pointer', background: 'var(--clr-bg-alt)', fontSize: '.85rem', fontWeight: 700 }}>
                {uploadingBanner ? 'Enviando...' : bannerUrl ? 'Trocar banner' : 'Enviar banner'}
                <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={uploadingBanner} onChange={e => handleBannerUpload(e.target.files?.[0] || null)} />
              </label>
            </div>
          )}

          <p style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.06em', color: 'var(--clr-text-light)', textTransform: 'uppercase', marginBottom: '1rem' }}>Dados Pessoais</p>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1.25rem' }}>
              <div>
                <label className={styles.formLabel}>Nome completo</label>
                <input {...register('name')} placeholder="Seu nome" className={styles.formInput} />
                {errors.name && <span className={styles.formError}>{errors.name.message}</span>}
              </div>
              
              <div>
                <label className={styles.formLabel}>Nome de Exibição / Fazenda</label>
                <input {...register('display_name')} placeholder="Ex: Fazenda São João" className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>CPF / CNPJ</label>
                <input {...register('document_number')} placeholder="000.000.000-00" className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>WhatsApp / Telefone</label>
                <input {...register('phone_whatsapp')} placeholder="+55 (99) 9 9999-9999" type="tel" className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{country === 'BR' ? 'CEP' : 'Código Postal'}</label>
                <input {...register('zip_code')} onBlur={handleCep} placeholder="00000-000" className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>Endereço (Rua/Av)</label>
                <input {...register('street')} placeholder="Ex: Av. Brasil" className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>Número</label>
                <input {...register('number')} placeholder="Ex: 1000" className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>Complemento</label>
                <input {...register('complement')} placeholder="Apto, Sala, Bloco..." className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>Bairro</label>
                <input {...register('neighborhood')} placeholder="Seu bairro" className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>Cidade</label>
                <input {...register('city')} placeholder="Sua cidade" className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{country === 'BR' ? 'Estado (UF)' : 'Província'}</label>
                <input {...register('state')} placeholder={country === 'BR' ? 'Ex: SP, MT...' : ''} className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>País</label>
                <select {...register('country')} className={styles.formInput} style={{ cursor: 'pointer' }}>
                  <option value="BR">🇧🇷 Brasil</option>
                  <option value="AR">🇦🇷 Argentina</option>
                  <option value="PY">🇵🇾 Paraguai</option>
                  <option value="UY">🇺🇾 Uruguai</option>
                  <option value="BO">🇧🇴 Bolívia</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label className={styles.formLabel}>Bio / Apresentação</label>
                <textarea {...register('bio')} rows={3} placeholder="Conte sobre você ou sua propriedade…" className={styles.formInput} style={{ resize: 'vertical' }} />
              </div>
            </div>

            <button type="submit" disabled={saving} className={styles.primaryButton} style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }}>
              {saving ? 'Salvando...' : 'Salvar Perfil'}
            </button>
          </form>
        </div>

        {/* Verificações */}
        <div className={styles.card} style={{ padding: '2rem' }}>
          <p style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.06em', color: 'var(--clr-text-light)', textTransform: 'uppercase', marginBottom: '1rem' }}>Verificação KYC</p>
          <p style={{ color: 'var(--clr-text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Complete as verificações abaixo para ganhar o selo de Vendedor Ouro e aumentar suas vendas.</p>

          <div style={{ display: 'flex', gap: '1.5rem', flexDirection: 'column' }}>
            {/* EMAIL */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.5rem', border: '1px solid var(--clr-border)', borderRadius: '.85rem', background: 'var(--clr-bg)' }}>
              <div style={{ background: 'var(--clr-primary-pale)', padding: '.75rem', borderRadius: '50%' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--clr-primary-mid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
                  <h3 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>E-mail</h3>
                  {user.email_confirmed_at ? (
                    <span className={`${styles.statusBadge} ${styles.statusActive}`}>Verificado</span>
                  ) : (
                    <span className={`${styles.statusBadge} ${styles.statusPending}`}>Pendente</span>
                  )}
                </div>
                <p style={{ color: 'var(--clr-text-muted)', fontSize: '.9rem', marginBottom: '1rem' }}>Verifique seu e-mail para receber notificações.</p>
                {!user.email_confirmed_at && (
                  <button type="button" onClick={handleResendEmail} className={styles.secondaryButton} style={{ width: '100%' }}>
                    Reenviar e-mail
                  </button>
                )}
              </div>
            </div>

            {/* WHATSAPP */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.5rem', border: '1px solid var(--clr-border)', borderRadius: '.85rem', background: 'var(--clr-bg)' }}>
              <div style={{ background: user.profile?.phone_whatsapp ? 'var(--clr-primary-pale)' : 'var(--clr-accent-pale)', padding: '.75rem', borderRadius: '50%' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={user.profile?.phone_whatsapp ? 'var(--clr-primary-mid)' : 'var(--clr-accent-dark)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
                  <h3 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>WhatsApp</h3>
                  {user.profile?.phone_whatsapp ? (
                    <span className={`${styles.statusBadge} ${styles.statusActive}`}>Verificado</span>
                  ) : (
                    <span className={`${styles.statusBadge} ${styles.statusPending}`}>Pendente</span>
                  )}
                </div>
                {!user.profile?.phone_whatsapp && (
                  <a href={`https://wa.me/5500000000000?text=${encodeURIComponent('Olá, quero verificar meu WhatsApp no Tauze Class. Meu e-mail é: ' + (user.email || ''))}`} target="_blank" rel="noopener noreferrer" className={styles.primaryButton} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                    Verificar WhatsApp
                  </a>
                )}
              </div>
            </div>

            {/* IDENTIDADE */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.5rem', border: '1px solid var(--clr-border)', borderRadius: '.85rem', background: 'var(--clr-bg)' }}>
              <div style={{ background: (user.profile?.kyc_status === 'approved') ? 'var(--clr-primary-pale)' : '#fef2f2', padding: '.75rem', borderRadius: '50%' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={(user.profile?.kyc_status === 'approved') ? 'var(--clr-primary-mid)' : 'var(--clr-error)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
                  <h3 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>Identidade</h3>
                  {(kycStatus === 'approved') ? (
                    <span className={`${styles.statusBadge} ${styles.statusActive}`}>Aprovado</span>
                  ) : (kycStatus === 'pending') ? (
                    <span className={`${styles.statusBadge} ${styles.statusPending}`}>Em Análise</span>
                  ) : (
                    <span className={`${styles.statusBadge} ${styles.statusExpired}`}>Não Enviado</span>
                  )}
                </div>
                <p style={{ color: 'var(--clr-text-muted)', fontSize: '.9rem', marginBottom: '1rem' }}>Envie RG/CNH e selfie.</p>
                
                {(!kycStatus || !['pending', 'approved'].includes(kycStatus)) && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.75rem', border: '1.5px dashed var(--clr-border-light)', borderRadius: '.75rem', cursor: 'pointer', background: 'var(--clr-bg-alt)' }}>
                        <span style={{ fontSize: '.75rem', fontWeight: 700 }}>{docFile ? docFile.name : 'RG/CNH'}</span>
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setDocFile(e.target.files?.[0] || null)} />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.75rem', border: '1.5px dashed var(--clr-border-light)', borderRadius: '.75rem', cursor: 'pointer', background: 'var(--clr-bg-alt)' }}>
                        <span style={{ fontSize: '.75rem', fontWeight: 700 }}>{selfieFile ? selfieFile.name : 'Selfie'}</span>
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setSelfieFile(e.target.files?.[0] || null)} />
                      </label>
                    </div>
                    <button type="button" onClick={handleKycSubmit} disabled={kycLoading} className={styles.primaryButton} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem', background: '#0f172a' }}>
                      {kycLoading ? 'Enviando...' : 'Enviar Documentos'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
