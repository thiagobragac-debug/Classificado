'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateProfile, getSupabase, safeFileExt } from '@/lib/supabase';
import { resendVerificationEmail } from '@/lib/supabase-panel';
import { showToast } from '@/lib/toast';
import { useLang } from '@/lib/lang-context';
import styles from '../painel.module.css';
import { Lock } from 'lucide-react';

const TRANSLATIONS = {
  pt: {
    title: 'Meu Perfil', subtitle: 'Informações da sua conta',
    profileAvatar: 'Foto de Perfil',
    changeAvatar: 'Trocar foto', sendAvatar: 'Enviar foto',
    avatarUpdated: 'Foto de perfil atualizada!',
    avatarError: 'Erro ao enviar foto. Tente novamente.',
    profileBanner: 'Banner de Perfil',
    bannerLocked: 'Banner de perfil é um recurso do plano Premium.',
    upgrade: 'Fazer upgrade',
    sending: 'Enviando...', changeBanner: 'Trocar banner', sendBanner: 'Enviar banner',
    personalData: 'Dados Pessoais',
    fullName: 'Nome completo', namePh: 'Seu nome',
    displayName: 'Nome de Exibição / Fazenda', displayNamePh: 'Ex: Fazenda São João',
    document: 'CPF / CNPJ', documentPh: '000.000.000-00',
    whatsapp: 'WhatsApp / Telefone', whatsappPh: '+55 (99) 9 9999-9999',
    zip: 'CEP', zipOther: 'Código Postal', zipPh: '00000-000',
    street: 'Endereço (Rua/Av)', streetPh: 'Ex: Av. Brasil',
    number: 'Número', numberPh: 'Ex: 1000',
    complement: 'Complemento', complementPh: 'Apto, Sala, Bloco...',
    neighborhood: 'Bairro', neighborhoodPh: 'Seu bairro',
    city: 'Cidade', cityPh: 'Sua cidade',
    state: 'Estado (UF)', province: 'Província', statePh: 'Ex: SP, MT...',
    country: 'País',
    countries: { BR: '🇧🇷 Brasil', AR: '🇦🇷 Argentina', PY: '🇵🇾 Paraguai', UY: '🇺🇾 Uruguai', BO: '🇧🇴 Bolívia' },
    bio: 'Bio / Apresentação', bioPh: 'Conte sobre você ou sua propriedade…',
    saving: 'Salvando...', save: 'Salvar Perfil',
    kycTitle: 'Verificação KYC',
    kycDesc: 'Complete as verificações abaixo para ganhar o selo de Vendedor Ouro e aumentar suas vendas.',
    email: 'E-mail', verified: 'Verificado', pending: 'Pendente',
    emailDesc: 'Verifique seu e-mail para receber notificações.',
    resendEmail: 'Reenviar e-mail',
    whatsappTitle: 'WhatsApp',
    identity: 'Identidade', approved: 'Aprovado', inReview: 'Em Análise', notSent: 'Não Enviado',
    identityDesc: 'Envie RG/CNH e selfie.',
    sendDocs: 'Enviar Documentos',
    imageError: 'Envie uma imagem (PNG, JPEG ou WebP).',
    bannerUpdated: 'Banner de perfil atualizado!',
    bannerError: 'Erro ao enviar banner. Tente novamente.',
    docExists: 'Este CPF/CNPJ já está cadastrado em outra conta.',
    saveError: 'Erro ao salvar perfil.',
    saveSuccess: 'Perfil salvo com sucesso!',
    resendSuccess: 'E-mail de confirmação reenviado!',
    resendError: 'Erro ao reenviar e-mail.',
    nameTooShort: 'Nome muito curto',
  },
  es: {
    title: 'Mi Perfil', subtitle: 'Información de tu cuenta',
    profileAvatar: 'Foto de Perfil',
    changeAvatar: 'Cambiar foto', sendAvatar: 'Enviar foto',
    avatarUpdated: '¡Foto de perfil actualizada!',
    avatarError: 'Error al enviar la foto. Inténtalo de nuevo.',
    profileBanner: 'Banner de Perfil',
    bannerLocked: 'El banner de perfil es una función del plan Premium.',
    upgrade: 'Hacer upgrade',
    sending: 'Enviando...', changeBanner: 'Cambiar banner', sendBanner: 'Enviar banner',
    personalData: 'Datos Personales',
    fullName: 'Nombre completo', namePh: 'Tu nombre',
    displayName: 'Nombre Público / Estancia', displayNamePh: 'Ej: Estancia San Juan',
    document: 'Documento de Identidad', documentPh: 'Número de documento',
    whatsapp: 'WhatsApp / Teléfono', whatsappPh: '+00 (00) 0000-0000',
    zip: 'Código Postal', zipOther: 'Código Postal', zipPh: '0000',
    street: 'Dirección (Calle/Av)', streetPh: 'Ej: Av. Brasil',
    number: 'Número', numberPh: 'Ej: 1000',
    complement: 'Complemento', complementPh: 'Depto, Piso, Bloque...',
    neighborhood: 'Barrio', neighborhoodPh: 'Tu barrio',
    city: 'Ciudad', cityPh: 'Tu ciudad',
    state: 'Estado (UF)', province: 'Provincia', statePh: '',
    country: 'País',
    countries: { BR: '🇧🇷 Brasil', AR: '🇦🇷 Argentina', PY: '🇵🇾 Paraguay', UY: '🇺🇾 Uruguay', BO: '🇧🇴 Bolivia' },
    bio: 'Bio / Presentación', bioPh: 'Cuéntanos sobre ti o tu propiedad…',
    saving: 'Guardando...', save: 'Guardar Perfil',
    kycTitle: 'Verificación KYC',
    kycDesc: 'Completa las verificaciones a continuación para ganar el sello de Vendedor Oro y aumentar tus ventas.',
    email: 'Correo Electrónico', verified: 'Verificado', pending: 'Pendiente',
    emailDesc: 'Verifica tu correo electrónico para recibir notificaciones.',
    resendEmail: 'Reenviar correo',
    whatsappTitle: 'WhatsApp',
    identity: 'Identidad', approved: 'Aprobado', inReview: 'En Revisión', notSent: 'No Enviado',
    identityDesc: 'Envía tu documento de identidad y una selfie.',
    sendDocs: 'Enviar Documentos',
    imageError: 'Envía una imagen (PNG, JPEG o WebP).',
    bannerUpdated: '¡Banner de perfil actualizado!',
    bannerError: 'Error al enviar el banner. Inténtalo de nuevo.',
    docExists: 'Este documento ya está registrado en otra cuenta.',
    saveError: 'Error al guardar el perfil.',
    saveSuccess: '¡Perfil guardado con éxito!',
    resendSuccess: '¡Correo de confirmación reenviado!',
    resendError: 'Error al reenviar el correo.',
    nameTooShort: 'Nombre muy corto',
  },
};

const profileSchema = z.object({
  name: z.string().min(2),
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
  const { lang } = useLang();
  const t = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt;
  const [saving, setSaving] = useState(false);
  const [kycStatus] = useState<string | undefined>(user.profile?.kyc_status);

  // GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): "Banner de
  // perfil" é vendido pro Premium (has_banner) mas nunca teve tela de
  // upload — profiles.banner_url só era lido (perfil público), nunca
  // escrito por ninguém. O bucket `profile-banners` já existia provisionado.
  const [hasBannerPlan, setHasBannerPlan] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(user.profile?.banner_url || null);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // GAP CORRIGIDO (achado em auditoria de imagens): avatar_url é lida em
  // mais de 10 arquivos do app (Header, perfil público do vendedor, cards de
  // anúncio, admin), sempre com fallback correto pra iniciais — mas nenhuma
  // tela jamais gravou nela. Diferente do banner (Premium), avatar não tem
  // gate de plano. Ver supabase/migrations/20260901170000_avatar_upload.sql.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.profile?.avatar_url || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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

  const handleAvatarUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast(t.imageError, 'error');
      return;
    }
    setUploadingAvatar(true);
    try {
      const previousUrl = avatarUrl;
      const ext = safeFileExt(file.name);
      const path = `${user.id}/${Date.now()}.${ext}`;
      const sb = getSupabase();
      const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { cacheControl: '31536000', upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = sb.storage.from('avatars').getPublicUrl(path);
      await updateProfile(user.id, { avatar_url: publicUrl });
      setAvatarUrl(publicUrl);
      showToast(t.avatarUpdated, 'success');

      // Mesma limpeza do banner de perfil logo abaixo — evita órfão no bucket.
      if (previousUrl) {
        const previousPath = previousUrl.split('/avatars/')[1];
        if (previousPath) {
          sb.storage.from('avatars').remove([previousPath]).catch(() => {});
        }
      }
    } catch (err: any) {
      console.error('[ProfileTab] Falha ao enviar avatar:', err.message);
      showToast(t.avatarError, 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleBannerUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast(t.imageError, 'error');
      return;
    }
    setUploadingBanner(true);
    try {
      const previousUrl = bannerUrl;
      const ext = safeFileExt(file.name);
      const path = `${user.id}/${Date.now()}.${ext}`;
      const sb = getSupabase();
      const { error: upErr } = await sb.storage.from('profile-banners').upload(path, file, { cacheControl: '31536000', upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = sb.storage.from('profile-banners').getPublicUrl(path);
      await updateProfile(user.id, { banner_url: publicUrl });
      setBannerUrl(publicUrl);
      showToast(t.bannerUpdated, 'success');

      // BUG CORRIGIDO (validação de 2026-08-26): cada troca de banner
      // deixava o arquivo anterior órfão no bucket — nunca era apagado,
      // só desreferenciado. Remove o antigo depois que o novo já está
      // salvo (se isso falhar, não é crítico — só um arquivo extra no
      // storage — por isso não usa o catch principal desta função).
      if (previousUrl) {
        const previousPath = previousUrl.split('/profile-banners/')[1];
        if (previousPath) {
          sb.storage.from('profile-banners').remove([previousPath]).catch(() => {});
        }
      }
    } catch (err: any) {
      // BUG CORRIGIDO (validação adversarial final): err.message cru do
      // Storage (RLS, sessão expirada, rede) era concatenado direto no
      // toast localizado — vazava texto técnico em inglês pro usuário.
      console.error('[ProfileTab] Falha ao enviar banner:', err.message);
      showToast(t.bannerError, 'error');
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
      // GAP CORRIGIDO (revisão de regras de negócio, 2026-08-25): salvava o
      // CPF/CNPJ exatamente como digitado (com ou sem pontuação) — o
      // mesmo documento em dois formatos diferentes ("123.456.789-00" vs
      // "12345678900") passaria pela constraint UNIQUE do banco como se
      // fossem documentos diferentes. Normaliza pra só dígitos, mesmo
      // padrão já usado em VerificacaoClient.tsx e no checkout.
      const payload = {
        ...data,
        document_number: data.document_number ? data.document_number.replace(/\D/g, '') : data.document_number,
      };
      await updateProfile(user.id, payload);
      showToast(t.saveSuccess, 'success');
    } catch (err: any) {
      if (err?.code === '23505') {
        showToast(t.docExists, 'error');
      } else {
        showToast(t.saveError, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResendEmail = async () => {
    if (!user.email) return;
    try {
      await resendVerificationEmail(user.email);
      showToast(t.resendSuccess, 'success');
    } catch {
      showToast(t.resendError, 'error');
    }
  };

  return (
    <div className={styles.fadeIn}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className={styles.headerTitle}>{t.title}</h1>
        <p className={styles.headerSubtitle}>{t.subtitle}</p>
      </div>

      <div className="profile-two-col">
        {/* Formulário de Dados */}
        <div className={styles.card} style={{ padding: '1.5rem' }}>
          <p style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.06em', color: 'var(--clr-text-light)', textTransform: 'uppercase', marginBottom: '1rem' }}>{t.profileAvatar}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={t.profileAvatar} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--clr-primary), #0ea5e9)', color: '#fff', fontWeight: 700, fontSize: '1.5rem' }}>
                {(user.profile?.display_name || user.profile?.name || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.6rem 1.1rem', border: '1.5px dashed var(--clr-border-light)', borderRadius: '.75rem', cursor: uploadingAvatar ? 'not-allowed' : 'pointer', background: 'var(--clr-bg-alt)', fontSize: '.85rem', fontWeight: 700 }}>
              {uploadingAvatar ? t.sending : avatarUrl ? t.changeAvatar : t.sendAvatar}
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={uploadingAvatar} onChange={e => handleAvatarUpload(e.target.files?.[0] || null)} />
            </label>
          </div>

          <p style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.06em', color: 'var(--clr-text-light)', textTransform: 'uppercase', marginBottom: '1rem' }}>{t.profileBanner}</p>
          {!hasBannerPlan ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.9rem 1rem', background: 'var(--clr-bg-alt)', borderRadius: '.75rem', color: 'var(--clr-text-muted)', fontSize: '.88rem', marginBottom: '1.5rem' }}>
              <Lock size={16} />
              {t.bannerLocked} <a href="/planos" style={{ color: 'var(--clr-primary)', fontWeight: 600 }}>{t.upgrade}</a>
            </div>
          ) : (
            <div style={{ marginBottom: '1.5rem' }}>
              {bannerUrl && (
                <img src={bannerUrl} alt={t.profileBanner} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: '.75rem', marginBottom: '.75rem' }} />
              )}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.6rem 1.1rem', border: '1.5px dashed var(--clr-border-light)', borderRadius: '.75rem', cursor: uploadingBanner ? 'not-allowed' : 'pointer', background: 'var(--clr-bg-alt)', fontSize: '.85rem', fontWeight: 700 }}>
                {uploadingBanner ? t.sending : bannerUrl ? t.changeBanner : t.sendBanner}
                <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={uploadingBanner} onChange={e => handleBannerUpload(e.target.files?.[0] || null)} />
              </label>
            </div>
          )}

          <p style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.06em', color: 'var(--clr-text-light)', textTransform: 'uppercase', marginBottom: '1rem' }}>{t.personalData}</p>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1.25rem' }}>
              <div>
                <label className={styles.formLabel}>{t.fullName}</label>
                <input {...register('name')} placeholder={t.namePh} className={styles.formInput} />
                {errors.name && <span className={styles.formError}>{t.nameTooShort}</span>}
              </div>

              <div>
                <label className={styles.formLabel}>{t.displayName}</label>
                <input {...register('display_name')} placeholder={t.displayNamePh} className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{t.document}</label>
                <input {...register('document_number')} placeholder={t.documentPh} className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{t.whatsapp}</label>
                <input {...register('phone_whatsapp')} placeholder={t.whatsappPh} type="tel" className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{country === 'BR' ? t.zip : t.zipOther}</label>
                <input {...register('zip_code')} onBlur={handleCep} placeholder={t.zipPh} className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{t.street}</label>
                <input {...register('street')} placeholder={t.streetPh} className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{t.number}</label>
                <input {...register('number')} placeholder={t.numberPh} className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{t.complement}</label>
                <input {...register('complement')} placeholder={t.complementPh} className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{t.neighborhood}</label>
                <input {...register('neighborhood')} placeholder={t.neighborhoodPh} className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{t.city}</label>
                <input {...register('city')} placeholder={t.cityPh} className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{country === 'BR' ? t.state : t.province}</label>
                <input {...register('state')} placeholder={country === 'BR' ? t.statePh : ''} className={styles.formInput} />
              </div>

              <div>
                <label className={styles.formLabel}>{t.country}</label>
                <select {...register('country')} className={styles.formInput} style={{ cursor: 'pointer' }}>
                  <option value="BR">{t.countries.BR}</option>
                  <option value="AR">{t.countries.AR}</option>
                  <option value="PY">{t.countries.PY}</option>
                  <option value="UY">{t.countries.UY}</option>
                  <option value="BO">{t.countries.BO}</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label className={styles.formLabel}>{t.bio}</label>
                <textarea {...register('bio')} rows={3} placeholder={t.bioPh} className={styles.formInput} style={{ resize: 'vertical' }} />
              </div>
            </div>

            <button type="submit" disabled={saving} className={styles.primaryButton} style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }}>
              {saving ? t.saving : t.save}
            </button>
          </form>
        </div>

        {/* Verificações */}
        <div className={styles.card} style={{ padding: '2rem' }}>
          <p style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.06em', color: 'var(--clr-text-light)', textTransform: 'uppercase', marginBottom: '1rem' }}>{t.kycTitle}</p>
          <p style={{ color: 'var(--clr-text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{t.kycDesc}</p>

          <div style={{ display: 'flex', gap: '1.5rem', flexDirection: 'column' }}>
            {/* EMAIL */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.5rem', border: '1px solid var(--clr-border)', borderRadius: '.85rem', background: 'var(--clr-bg)' }}>
              <div style={{ background: 'var(--clr-primary-pale)', padding: '.75rem', borderRadius: '50%' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--clr-primary-mid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
                  <h3 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>{t.email}</h3>
                  {user.email_confirmed_at ? (
                    <span className={`${styles.statusBadge} ${styles.statusActive}`}>{t.verified}</span>
                  ) : (
                    <span className={`${styles.statusBadge} ${styles.statusPending}`}>{t.pending}</span>
                  )}
                </div>
                <p style={{ color: 'var(--clr-text-muted)', fontSize: '.9rem', marginBottom: '1rem' }}>{t.emailDesc}</p>
                {!user.email_confirmed_at && (
                  <button type="button" onClick={handleResendEmail} className={styles.secondaryButton} style={{ width: '100%' }}>
                    {t.resendEmail}
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
                  <h3 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>{t.whatsappTitle}</h3>
                  {user.profile?.phone_whatsapp ? (
                    <span className={`${styles.statusBadge} ${styles.statusActive}`}>{t.verified}</span>
                  ) : (
                    <span className={`${styles.statusBadge} ${styles.statusPending}`}>{t.pending}</span>
                  )}
                </div>
                {/* BUG CORRIGIDO (varredura cruzada de cenários): o botão
                    "Verificar WhatsApp" apontava pra um número fixo falso
                    (5500000000000) — clicar abria uma conversa com
                    ninguém. Não há nenhum número real de suporte
                    configurado (checado em platform_settings); escondido
                    até existir um número de verdade pra usar aqui. */}
              </div>
            </div>

            {/* IDENTIDADE */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.5rem', border: '1px solid var(--clr-border)', borderRadius: '.85rem', background: 'var(--clr-bg)' }}>
              <div style={{ background: (user.profile?.kyc_status === 'approved') ? 'var(--clr-primary-pale)' : '#fef2f2', padding: '.75rem', borderRadius: '50%' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={(user.profile?.kyc_status === 'approved') ? 'var(--clr-primary-mid)' : 'var(--clr-error)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
                  <h3 style={{ fontWeight: 700, margin: 0, fontSize: '1rem' }}>{t.identity}</h3>
                  {(kycStatus === 'approved') ? (
                    <span className={`${styles.statusBadge} ${styles.statusActive}`}>{t.approved}</span>
                  ) : (kycStatus === 'pending') ? (
                    <span className={`${styles.statusBadge} ${styles.statusPending}`}>{t.inReview}</span>
                  ) : (
                    <span className={`${styles.statusBadge} ${styles.statusExpired}`}>{t.notSent}</span>
                  )}
                </div>
                <p style={{ color: 'var(--clr-text-muted)', fontSize: '.9rem', marginBottom: '1rem' }}>{t.identityDesc}</p>

                {/* BUG CORRIGIDO (revisão de regras de negócio, 2026-08-25):
                    esta tela tinha seu PRÓPRIO formulário de envio de KYC,
                    duplicado e quebrado — updateProfile tentava gravar
                    kyc_status direto (coluna privilegiada, guard_profile_
                    verification bloqueia qualquer escrita fora de
                    service_role) e nunca criava a linha em
                    verification_requests que a fila do admin lê. Os
                    arquivos subiam pro bucket e ficavam órfãos; o usuário só
                    via "Erro ao enviar documentos.". O fluxo real e
                    funcional é /painel/verificacao (cria a solicitação
                    corretamente) — em vez de manter dois caminhos pro mesmo
                    fim, este vira um link pro que já funciona. */}
                {(!kycStatus || !['pending', 'approved'].includes(kycStatus)) && (
                  <a href="/painel/verificacao" className={styles.primaryButton} style={{ width: '100%', justifyContent: 'center', background: '#0f172a', textDecoration: 'none' }}>
                    {t.sendDocs}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
