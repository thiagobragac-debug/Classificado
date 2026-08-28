'use client'

import React, { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { showToast } from '@/lib/toast'
import { useLang } from '@/lib/lang-context'

const TRANSLATIONS = {
  pt: {
    title: 'Verificação de Identidade',
    subtitle: 'Obtenha o selo de confiança e feche negócios até 3x mais rápido na plataforma.',
    loadingData: 'Carregando dados de identidade...',
    verifiedTitle: 'Sua identidade está verificada!',
    verifiedDesc: 'O selo verde já está ativo no seu perfil e anúncios.',
    govbrSoon: '(em breve)',
    govbrDesc: 'A verificação automática por conta Ouro ou Prata do Gov.br ainda está em desenvolvimento. Por enquanto, use o envio de documentos.',
    govbrBtn: 'Entrar com gov.br',
    planBadgeTitle: 'Selo via Plano Pro/Premium',
    planBadgeDesc: 'Assinantes dos planos pagos com pagamento via Cartão de Crédito aprovado ganham o selo automaticamente.',
    seePlans: 'Ver Planos',
    manualTitle: 'Envio Manual de Documentos',
    manualDesc: 'Não quer usar o Gov.br? Envie fotos da sua CNH ou RG e uma Selfie. A análise demora até 2 dias úteis.',
    collapse: 'Recolher', attach: 'Anexar Documentos',
    pendingReview: '⚠️ Seus documentos estão em análise pela nossa equipe.',
    rejected: '❌ Sua última verificação foi recusada. Verifique a legibilidade dos arquivos e tente novamente.',
    docLabel: 'CPF ou CNPJ',
    docPh: '000.000.000-00 ou 00.000.000/0001-00',
    typeDetected: 'Tipo detectado: ',
    pessoaFisica: '👤 Pessoa Física (CPF)', pessoaJuridica: '🏢 Pessoa Jurídica (CNPJ)',
    docFront: 'Documento (Frente)', docBack: 'Documento (Verso)',
    selfieLabel: 'Selfie (Você segurando o documento)',
    sending: 'Enviando arquivos de forma segura...', submit: 'Enviar para Análise Manual',
    govbrToast: 'Integração com o Gov.br ainda não disponível. Use o envio de documentos abaixo.',
    fillDocument: 'Por favor, informe o CPF ou CNPJ.',
    attach3Files: 'Por favor, anexe os 3 arquivos.',
    sendSuccess: 'Documentos enviados com sucesso! Aguarde a análise.',
    sendError: 'Erro ao enviar: ',
    notAuthenticated: 'Não autenticado',
  },
  es: {
    title: 'Verificación de Identidad',
    subtitle: 'Obtén el sello de confianza y cierra negocios hasta 3 veces más rápido en la plataforma.',
    loadingData: 'Cargando datos de identidad...',
    verifiedTitle: '¡Tu identidad está verificada!',
    verifiedDesc: 'El sello verde ya está activo en tu perfil y anuncios.',
    govbrSoon: '(próximamente)',
    govbrDesc: 'La verificación automática por cuenta Oro o Plata de Gov.br todavía está en desarrollo. Por ahora, usa el envío de documentos.',
    govbrBtn: 'Ingresar con gov.br',
    planBadgeTitle: 'Sello vía Plan Pro/Premium',
    planBadgeDesc: 'Los suscriptores de planes pagos con pago aprobado por Tarjeta de Crédito obtienen el sello automáticamente.',
    seePlans: 'Ver Planes',
    manualTitle: 'Envío Manual de Documentos',
    manualDesc: '¿No quieres usar Gov.br? Envía fotos de tu documento de identidad y una selfie. El análisis demora hasta 2 días hábiles.',
    collapse: 'Contraer', attach: 'Adjuntar Documentos',
    pendingReview: '⚠️ Tus documentos están en análisis por nuestro equipo.',
    rejected: '❌ Tu última verificación fue rechazada. Verifica la legibilidad de los archivos e intenta de nuevo.',
    docLabel: 'Documento de Identidad',
    docPh: 'Número de documento',
    typeDetected: 'Tipo detectado: ',
    pessoaFisica: '👤 Persona Física', pessoaJuridica: '🏢 Persona Jurídica',
    docFront: 'Documento (Frente)', docBack: 'Documento (Dorso)',
    selfieLabel: 'Selfie (Sosteniendo el documento)',
    sending: 'Enviando archivos de forma segura...', submit: 'Enviar para Análisis Manual',
    govbrToast: 'La integración con Gov.br aún no está disponible. Usa el envío de documentos a continuación.',
    fillDocument: 'Por favor, indica tu documento de identidad.',
    attach3Files: 'Por favor, adjunta los 3 archivos.',
    sendSuccess: '¡Documentos enviados con éxito! Espera el análisis.',
    sendError: 'Error al enviar: ',
    notAuthenticated: 'No autenticado',
  },
};

export default function VerificacaoClient() {
  const { lang } = useLang()
  const t = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.pt
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  
  // States para o fluxo manual
  const [showManual, setShowManual] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [docFront, setDocFront] = useState<File | null>(null)
  const [docBack, setDocBack] = useState<File | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [cpfCnpj, setCpfCnpj] = useState('')

  // Detecta tipo pelo número de dígitos do CPF/CNPJ
  const docType = cpfCnpj.replace(/\D/g, '').length <= 11 ? 'pessoa_fisica' : 'pessoa_juridica'
  
  const [requestStatus, setRequestStatus] = useState<string | null>(null)
  
  const router = useRouter()

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser() {
    setLoading(true)
    const supabase = getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login?next=/painel/verificacao')
      return
    }

    // Busca profile e verifica o status
    // select('*') quebrava aqui: is_admin/is_blocked deixaram de ter grant
    // público (achado de segurança 2026-08-24) e um select com * exige
    // acesso a toda coluna, mesmo que o valor nunca seja usado no render.
    const { data: profile } = await supabase.from('profiles').select('id, name, verified, kyc_status').eq('id', session.user.id).single()
    setUser(profile)
    
    // Verifica se já tem request pendente
    const { data: req } = await supabase.from('verification_requests')
      .select('status')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      
    if (req && req.length > 0) {
      setRequestStatus(req[0].status)
    }

    setLoading(false)
  }

  // A integração com o Gov.br não existe. O que havia aqui era um setTimeout
  // seguido de `update profiles set verified = true` no próprio usuário — ou
  // seja, qualquer pessoa logada clicava no botão e saía com o selo, que é o
  // sinal de confiança que os compradores usam para decidir com quem negociar.
  //
  // Enquanto o OAuth do Gov.br não for realmente implementado, o botão aponta
  // para o fluxo que existe de verdade: o envio manual de documentos, revisado
  // por um humano no painel administrativo.
  const handleGovBrIndisponivel = () => {
    showToast(t.govbrToast, 'info')
    setShowManual(true)
  }

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cpfCnpj.trim()) {
      showToast(t.fillDocument, 'error')
      return
    }
    if (!docFront || !docBack || !selfie) {
      showToast(t.attach3Files, 'error')
      return
    }
    
    setUploading(true)
    try {
      const supabase = getSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(t.notAuthenticated)

      // Grava o PATH, não uma URL. O bucket é privado de propósito — documento
      // de identidade e selfie não podem ficar acessíveis por URL adivinhável.
      // O painel admin pede uma URL assinada de vida curta em /api/admin/kyc-url.
      //
      // Antes isto usava o bucket 'kyc-documents' e guardava getPublicUrl(),
      // que num bucket privado sempre responde 403: nenhum documento chegava a
      // ser visível para o admin. O bucket correto é 'kyc-docs', o mesmo que o
      // fluxo do ProfileTab já utilizava.
      const uploadFile = async (file: File, suffix: string) => {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `${session.user.id}/${Date.now()}_${suffix}.${ext}`
        const { error } = await supabase.storage.from('kyc-docs').upload(path, file)
        if (error) throw error
        return path
      }

      const frontPath = await uploadFile(docFront, 'front')
      const backPath = await uploadFile(docBack, 'back')
      const selfiePath = await uploadFile(selfie, 'selfie')

      const { error } = await supabase.from('verification_requests').insert({
        user_id: session.user.id,
        document_front: frontPath,
        document_back: backPath,
        selfie: selfiePath,
        status: 'pending',
        cpf_cnpj: cpfCnpj.replace(/\D/g, ''),
        type: docType,
      })

      if (error) throw error

      showToast(t.sendSuccess, 'success')
      setRequestStatus('pending')
      setShowManual(false)
    } catch (err: any) {
      showToast(t.sendError + err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>{t.loadingData}</div>
  }

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>{t.title}</h1>
      <p style={{ color: '#64748b', marginBottom: '32px' }}>
        {t.subtitle}
      </p>

      {user?.verified ? (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '32px', borderRadius: '12px', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', background: '#22c55e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h2 style={{ color: '#166534', margin: '0 0 8px 0' }}>{t.verifiedTitle}</h2>
          <p style={{ color: '#15803d', margin: 0 }}>{t.verifiedDesc}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '24px' }}>
          {/* Opção 1: Gov.br */}
          <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                Gov.br <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#94a3b8' }}>{t.govbrSoon}</span>
              </h3>
              <p style={{ color: '#64748b', margin: 0, fontSize: '0.95rem' }}>
                {t.govbrDesc}
              </p>
            </div>
            <button
              onClick={handleGovBrIndisponivel}
              style={{ background: '#2563eb', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {t.govbrBtn}
            </button>
          </div>

          {/* Opção 2: Pagamento */}
          <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                {t.planBadgeTitle}
              </h3>
              <p style={{ color: '#64748b', margin: 0, fontSize: '0.95rem' }}>
                {t.planBadgeDesc}
              </p>
            </div>
            <Link
              href="/planos"
              style={{ background: 'transparent', color: '#1e293b', border: '1px solid #cbd5e1', padding: '12px 24px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              {t.seePlans}
            </Link>
          </div>

          {/* Opção 3: Manual */}
          <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showManual ? '20px' : '0' }}>
              <div>
                <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                  {t.manualTitle}
                </h3>
                <p style={{ color: '#64748b', margin: 0, fontSize: '0.95rem' }}>
                  {t.manualDesc}
                </p>
              </div>
              <button
                onClick={() => setShowManual(!showManual)}
                style={{ background: 'transparent', color: '#1e293b', border: '1px solid #cbd5e1', padding: '12px 24px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {showManual ? t.collapse : t.attach}
              </button>
            </div>

            {requestStatus === 'pending' && !showManual && (
              <div style={{ marginTop: '16px', background: '#fffbeb', padding: '12px 16px', borderRadius: '8px', color: '#b45309', fontWeight: 500, fontSize: '0.9rem' }}>
                {t.pendingReview}
              </div>
            )}
            {requestStatus === 'rejected' && !showManual && (
              <div style={{ marginTop: '16px', background: '#fef2f2', padding: '12px 16px', borderRadius: '8px', color: '#b91c1c', fontWeight: 500, fontSize: '0.9rem' }}>
                {t.rejected}
              </div>
            )}

            {showManual && (
              <form onSubmit={handleManualSubmit} style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* CPF / CNPJ */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>
                    {t.docLabel} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder={t.docPh}
                    value={cpfCnpj}
                    onChange={e => setCpfCnpj(e.target.value)}
                    maxLength={18}
                    style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                  />
                  {cpfCnpj.replace(/\D/g, '').length > 0 && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                      {t.typeDetected}<strong>{docType === 'pessoa_fisica' ? t.pessoaFisica : t.pessoaJuridica}</strong>
                    </p>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>{t.docFront}</label>
                    <input type="file" accept="image/*" onChange={e => setDocFront(e.target.files?.[0] || null)} style={{ display: 'block', width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>{t.docBack}</label>
                    <input type="file" accept="image/*" onChange={e => setDocBack(e.target.files?.[0] || null)} style={{ display: 'block', width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '6px' }}>{t.selfieLabel}</label>
                  <input type="file" accept="image/*,capture=camera" onChange={e => setSelfie(e.target.files?.[0] || null)} style={{ display: 'block', width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                </div>

                <button
                  type="submit"
                  disabled={uploading || (!docFront || !docBack || !selfie)}
                  style={{ background: '#0f172a', color: 'white', border: 'none', padding: '14px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', marginTop: '8px', opacity: uploading || (!docFront || !docBack || !selfie) ? 0.5 : 1 }}
                >
                  {uploading ? t.sending : t.submit}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
