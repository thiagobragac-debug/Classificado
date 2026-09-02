'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { showToast } from '@/lib/toast'

/* ─── Mapeamento correto de chaves (UI → banco) ─────────────────── */
// Chaves existentes no banco: stripe_pub_key, stripe_secret_key, stripe_webhook_secret,
// mp_access_token, mp_public_key, pagarme_api_key, pagarme_pub_key, payment_gateway,
// tc_logo_url, tc_feat_auctions, tc_feat_plans, tc_feat_social_login, tc_cnt_*

type Settings = Record<string, string>

const TABS = [
  { id: 'brand',    icon: '🎨', label: 'Aparência da Marca' },
  { id: 'home',     icon: '🏠', label: 'Página Inicial' },
  { id: 'features', icon: '⚙️', label: 'Recursos Extras' },
  { id: 'gateways', icon: '💳', label: 'Gateways de Pagamento' },
  { id: 'storage',  icon: '🗄️', label: 'Armazenamento' },
]

/* ─── Sub-componentes ───────────────────────────────────────────── */

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="cfg-field">
      <label className="cfg-label">{label}</label>
      {hint && <p className="cfg-hint">{hint}</p>}
      {children}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <div className="cfg-toggle-row">
      <div className="cfg-toggle-info">
        <span className="cfg-toggle-label">{label}</span>
        {description && <span className="cfg-toggle-desc">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`cfg-toggle ${checked ? 'cfg-toggle--on' : ''}`}
      >
        <span className="cfg-toggle-thumb" />
      </button>
    </div>
  )
}

function PasswordField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  jaConfigurado,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  // Segredo já gravado no banco. O valor não é enviado ao navegador, então o
  // campo aparece vazio — sem este aviso pareceria configuração perdida.
  jaConfigurado?: boolean
}) {
  const [show, setShow] = useState(false)
  const dica = jaConfigurado
    ? `${hint ? hint + ' ' : ''}Já configurado — deixe em branco para manter, ou digite um valor novo para substituir.`
    : hint
  return (
    <FieldGroup label={label} hint={dica}>
      <div className="cfg-password-wrap">
        <input
          type={show ? 'text' : 'password'}
          className="adm-input cfg-password-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={jaConfigurado ? '•••••••• (mantém o valor atual)' : placeholder || '••••••••••••••••••••••'}
          autoComplete="off"
        />
        <button
          type="button"
          className="cfg-password-toggle"
          onClick={() => setShow(s => !s)}
          title={show ? 'Ocultar' : 'Mostrar'}
        >
          {show ? (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>
    </FieldGroup>
  )
}

/* ─── Componente principal ──────────────────────────────────────── */

export default function AdminConfiguracoes() {
  const [activeTab, setActiveTab] = useState('brand')
  const [settings, setSettings] = useState<Settings>({})
  // BUG CORRIGIDO (achado de usabilidade): formulário longo (várias abas,
  // incluindo segredos de gateway de pagamento) sem nenhum aviso de
  // alterações pendentes — fechar a aba ou trocar de página perdia tudo em
  // silêncio. `initialSettings` guarda o snapshot carregado do servidor
  // para comparação; mesmo padrão de proteção contra fechamento acidental
  // já usado no wizard de anúncio (AnunciarWizard.tsx).
  const [initialSettings, setInitialSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoPreviewError, setLogoPreviewError] = useState(false)
  const [chavesSecretas, setChavesSecretas] = useState<Set<string>>(new Set())
  const [secretasPreenchidas, setSecretasPreenchidas] = useState<Set<string>>(new Set())

  const isDirty = JSON.stringify(settings) !== JSON.stringify(initialSettings)

  useEffect(() => { loadSettings() }, [])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = '' // Required for legacy browsers
        return ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // Leitura e escrita passam por /api/admin/settings. Antes o painel falava
  // direto com o PostgREST usando a anon key, e como o admin autenticado
  // enxerga as chaves secretas, stripe_secret_key, mp_access_token e
  // pagarme_api_key vinham parar no navegador a cada abertura da tela.
  // A rota devolve os segredos em branco e informa apenas quais estão
  // preenchidos; campo em branco no salvamento significa "não mexi".
  async function loadSettings() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings')
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Falha ao carregar')
      setSettings(payload.settings)
      setInitialSettings(payload.settings)
      setChavesSecretas(new Set<string>(payload.chavesSecretas))
      setSecretasPreenchidas(new Set<string>(payload.secretasPreenchidas))
    } catch (err) {
      showToast('Erro ao carregar configurações: ' + (err as Error).message, 'error')
    }
    setLoading(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Falha ao salvar')
      showToast('Configurações salvas com sucesso!', 'success')
      // Recarrega para refletir quais segredos passaram a estar preenchidos.
      await loadSettings()
    } catch (err) {
      showToast('Erro ao salvar: ' + (err as Error).message, 'error')
    }
    setSaving(false)
  }

  const set = useCallback((key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const setBool = useCallback((key: string, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value ? '1' : '0' }))
  }, [])

  const getBool = (key: string) => settings[key] === '1' || settings[key] === 'true'
  const get = (key: string, fallback = '') => settings[key] ?? fallback

  // Segredo nunca chega ao cliente: o servidor informa apenas se está gravado.
  // Para os demais campos, basta o valor em si.
  const estaPreenchido = (key: string) =>
    chavesSecretas.has(key) ? secretasPreenchidas.has(key) : !!get(key)

  const logoUrl = get('tc_logo_url')
  const primaryColor = get('primary_color', '#16A34A')

  return (
    <>
      <style>{`
        /* ── Configurações Premium – estilos locais ── */
        .cfg-layout { display: flex; gap: 0; align-items: flex-start; }

        /* Sidebar tabs */
        .cfg-tabs {
          display: flex; flex-direction: column; gap: 10px;
          min-width: 240px; padding-right: 32px;
          border-right: 1px solid var(--adm-border);
        }
        .cfg-tab {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px; border-radius: var(--adm-r-md);
          font-size: .875rem; font-weight: 500; color: var(--adm-text-muted);
          background: none; border: none; cursor: pointer; text-align: left;
          transition: all 200ms ease; position: relative;
        }
        .cfg-tab:hover { background: var(--adm-surface-2); color: var(--adm-text); }
        .cfg-tab--active {
          background: var(--adm-accent-pale); color: var(--adm-accent);
          font-weight: 600;
        }
        .cfg-tab--active::before {
          content: ''; position: absolute; left: 0; top: 20%; bottom: 20%;
          width: 3px; background: var(--adm-accent); border-radius: 0 3px 3px 0;
        }
        .cfg-tab-icon { font-size: 1rem; flex-shrink: 0; }

        /* Form panel */
        .cfg-panel { flex: 1; padding-left: 36px; }
        .cfg-section-title {
          font-family: var(--font-display); font-size: 1rem; font-weight: 700;
          color: var(--adm-text); margin-bottom: 20px;
          display: flex; align-items: center; gap: 8px;
        }
        .cfg-section-title::after {
          content: ''; flex: 1; height: 1px; background: var(--adm-border);
        }

        /* Fields */
        .cfg-fields { display: flex; flex-direction: column; gap: 22px; }
        .cfg-field { display: flex; flex-direction: column; gap: 6px; }
        .cfg-label { font-size: .8rem; font-weight: 600; color: var(--adm-text); letter-spacing: .01em; }
        .cfg-hint { font-size: .75rem; color: var(--adm-text-muted); margin: -2px 0 4px; }

        /* Color picker composto */
        .cfg-color-row { display: flex; align-items: center; gap: 12px; }
        .cfg-color-picker {
          width: 44px; height: 44px; border-radius: var(--adm-r-md);
          border: 2px solid var(--adm-border); cursor: pointer;
          padding: 2px; background: none; flex-shrink: 0;
          transition: border-color 200ms;
        }
        .cfg-color-picker:hover { border-color: var(--adm-accent); }
        .cfg-color-hex {
          flex: 1; font-family: 'Courier New', monospace;
          font-size: .875rem; text-transform: uppercase;
          letter-spacing: .05em;
        }
        .cfg-color-preview {
          width: 44px; height: 44px; border-radius: var(--adm-r-md);
          border: 1px solid var(--adm-border); flex-shrink: 0;
          transition: background-color 300ms ease;
        }

        /* Logo preview */
        .cfg-logo-row { display: flex; align-items: center; gap: 16px; }
        .cfg-logo-preview {
          width: 80px; height: 44px; border-radius: var(--adm-r-md);
          border: 1px solid var(--adm-border); background: var(--adm-surface-2);
          display: flex; align-items: center; justify-content: center;
          overflow: hidden; flex-shrink: 0; font-size: .65rem;
          color: var(--adm-text-light); text-align: center;
        }
        .cfg-logo-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }

        /* Password field */
        .cfg-password-wrap { position: relative; }
        .cfg-password-input { padding-right: 44px !important; }
        .cfg-password-toggle {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: var(--adm-text-light); display: flex; align-items: center;
          transition: color 200ms;
        }
        .cfg-password-toggle:hover { color: var(--adm-text); }

        /* Toggle switch */
        .cfg-toggle-row {
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px; padding: 14px 16px;
          background: var(--adm-surface-2); border-radius: var(--adm-r-md);
          border: 1px solid var(--adm-border);
        }
        .cfg-toggle-info { display: flex; flex-direction: column; gap: 2px; }
        .cfg-toggle-label { font-size: .875rem; font-weight: 600; color: var(--adm-text); }
        .cfg-toggle-desc { font-size: .75rem; color: var(--adm-text-muted); }
        .cfg-toggle {
          width: 48px; height: 26px; border-radius: 13px;
          background: var(--adm-surface-3); border: none; cursor: pointer;
          position: relative; flex-shrink: 0;
          transition: background 250ms ease;
        }
        .cfg-toggle--on { background: var(--adm-accent); }
        .cfg-toggle-thumb {
          position: absolute; left: 3px; top: 3px;
          width: 20px; height: 20px; border-radius: 50%;
          background: white; box-shadow: 0 1px 4px rgba(0,0,0,.2);
          transition: transform 250ms ease;
        }
        .cfg-toggle--on .cfg-toggle-thumb { transform: translateX(22px); }

        /* Info box */
        .cfg-info-box {
          padding: 14px 16px; border-radius: var(--adm-r-md);
          background: var(--adm-accent-pale);
          border-left: 3px solid var(--adm-accent);
        }
        .cfg-info-box h4 { font-size: .875rem; font-weight: 700; color: var(--adm-text); margin-bottom: 4px; }
        .cfg-info-box p { font-size: .8rem; color: var(--adm-text-muted); margin: 0; line-height: 1.5; }

        /* Gateway section divider */
        .cfg-gateway-block {
          padding: 20px; border-radius: var(--adm-r-lg);
          border: 1px solid var(--adm-border); background: var(--adm-bg);
          display: flex; flex-direction: column; gap: 16px;
        }
        .cfg-gateway-header {
          display: flex; align-items: center; gap: 10px;
          font-weight: 700; font-size: .9rem; color: var(--adm-text);
          padding-bottom: 12px; border-bottom: 1px solid var(--adm-border);
        }
        .cfg-gateway-badge {
          font-size: .65rem; font-weight: 700; padding: 2px 8px;
          border-radius: var(--adm-r-full); text-transform: uppercase; letter-spacing: .05em;
        }
        .cfg-gateway-badge--stripe { background: #635BFF22; color: #635BFF; }
        .cfg-gateway-badge--mp { background: #009EE322; color: #009EE3; }
        .cfg-gateway-badge--pagarme { background: #03A87C22; color: #03A87C; }
        .cfg-gateway-status { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 600; }
        .cfg-gateway-status--ok { color: #10b981; }
        .cfg-gateway-status--missing { color: #ef4444; }
        .cfg-gw-info-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 16px; font-size: 0.8rem; color: #166534; }
        .cfg-gw-info-box strong { display: block; margin-bottom: 4px; }

        /* Save bar */
        .cfg-save-bar {
          margin-top: 32px; padding-top: 20px;
          border-top: 1px solid var(--adm-border);
          display: flex; align-items: center; gap: 12px;
        }

        /* Loading skeleton */
        .cfg-skeleton { display: flex; flex-direction: column; gap: 20px; padding-left: 36px; flex: 1; }
        .cfg-skel-line {
          height: 44px; border-radius: var(--adm-r-md);
          background: linear-gradient(90deg, var(--adm-surface-2) 25%, var(--adm-surface-3) 50%, var(--adm-surface-2) 75%);
          background-size: 200% 100%;
          animation: skel-shine 1.4s infinite;
        }
        .cfg-skel-line--short { height: 16px; width: 40%; }
        @keyframes skel-shine {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div className="adm-page-header">
        <h1 className="adm-page-title">Configurações Premium</h1>
        <p className="adm-page-sub">Gestão centralizada de aparência e comportamento do portal.</p>
      </div>

      <div className="adm-card" style={{ padding: '2rem' }}>
        <div className="cfg-layout">

          {/* ── Tabs laterais ── */}
          <nav className="cfg-tabs">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`cfg-tab ${activeTab === tab.id ? 'cfg-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="cfg-tab-icon">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>

          {/* ── Painel do formulário ── */}
          {loading ? (
            <div className="cfg-skeleton">
              <div className="cfg-skel-line cfg-skel-line--short" />
              <div className="cfg-skel-line" />
              <div className="cfg-skel-line" />
              <div className="cfg-skel-line" style={{ height: 80 }} />
            </div>
          ) : (
            <form onSubmit={handleSave} className="cfg-panel">

              {/* ══ ABA: APARÊNCIA DA MARCA ══════════════════════════════ */}
              {activeTab === 'brand' && (
                <div className="cfg-fields">
                  <p className="cfg-section-title">🎨 Identidade Visual</p>

                  {/* Logo */}
                  <FieldGroup
                    label="URL do Logotipo"
                    hint="Cole a URL pública da imagem do logo (PNG, SVG ou base64)."
                  >
                    <div className="cfg-logo-row">
                      <div className="cfg-logo-preview">
                        {logoUrl && !logoPreviewError ? (
                          <img
                            src={logoUrl}
                            alt="Logo preview"
                            onError={() => setLogoPreviewError(true)}
                          />
                        ) : (
                          <span>Prévia</span>
                        )}
                      </div>
                      <input
                        type="text"
                        className="adm-input"
                        style={{ flex: 1 }}
                        value={logoUrl}
                        onChange={e => {
                          setLogoPreviewError(false)
                          set('tc_logo_url', e.target.value)
                        }}
                        placeholder="https://... ou data:image/..."
                      />
                    </div>
                  </FieldGroup>

                  {/* Cor primária */}
                  <FieldGroup
                    label="Cor Primária"
                    hint="Cor principal usada em botões, destaques e ícones ativos."
                  >
                    <div className="cfg-color-row">
                      <input
                        type="color"
                        className="cfg-color-picker"
                        value={primaryColor}
                        onChange={e => set('primary_color', e.target.value)}
                        title="Selecionar cor"
                      />
                      <input
                        type="text"
                        className="adm-input cfg-color-hex"
                        value={primaryColor}
                        onChange={e => {
                          const v = e.target.value
                          if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) set('primary_color', v)
                        }}
                        maxLength={7}
                        placeholder="#16A34A"
                      />
                      <div
                        className="cfg-color-preview"
                        style={{ backgroundColor: primaryColor }}
                        title="Pré-visualização"
                      />
                    </div>
                  </FieldGroup>

                  {/* Dark mode */}
                  <FieldGroup label="Modo Escuro (padrão para visitantes)">
                    <select
                      className="adm-select"
                      value={get('dark_mode', 'auto')}
                      onChange={e => set('dark_mode', e.target.value)}
                    >
                      <option value="auto">Automático (segue o sistema do usuário)</option>
                      <option value="dark">Sempre Escuro</option>
                      <option value="light">Sempre Claro</option>
                    </select>
                  </FieldGroup>
                </div>
              )}

              {/* ══ ABA: PÁGINA INICIAL ══════════════════════════════════ */}
              {activeTab === 'home' && (
                <div className="cfg-fields">
                  <p className="cfg-section-title">🏠 Hero Banner</p>

                  <FieldGroup label="Título Principal do Banner">
                    <input
                      type="text"
                      className="adm-input"
                      value={get('hero_title')}
                      onChange={e => set('hero_title', e.target.value)}
                      placeholder="Ex: Compre e Venda com Segurança"
                    />
                  </FieldGroup>

                  <FieldGroup label="Subtítulo do Banner">
                    <input
                      type="text"
                      className="adm-input"
                      value={get('hero_subtitle')}
                      onChange={e => set('hero_subtitle', e.target.value)}
                      placeholder="Ex: O maior classificado do Brasil"
                    />
                  </FieldGroup>

                  <Toggle
                    checked={getBool('show_hero')}
                    onChange={v => setBool('show_hero', v)}
                    label="Exibir Banner no Topo"
                    description="Ativa o bloco hero na página inicial do site público."
                  />
                </div>
              )}

              {/* ══ ABA: RECURSOS EXTRAS ═════════════════════════════════ */}
              {activeTab === 'features' && (
                <div className="cfg-fields">
                  <p className="cfg-section-title">⚙️ Funcionalidades do Portal</p>

                  <Toggle
                    checked={getBool('tc_feat_auctions')}
                    onChange={v => setBool('tc_feat_auctions', v)}
                    label="Leilões e Remates"
                    description="Habilita a aba de leilões ao vivo no site público."
                  />

                  <Toggle
                    checked={getBool('tc_feat_plans')}
                    onChange={v => setBool('tc_feat_plans', v)}
                    label="Planos de Assinatura"
                    description="Exibe e ativa os planos pagos para anunciantes."
                  />

                  <Toggle
                    checked={getBool('tc_feat_social_login')}
                    onChange={v => setBool('tc_feat_social_login', v)}
                    label="Login Social (Google / Facebook)"
                    description="Permite autenticação via provedores externos."
                  />

                  <Toggle
                    checked={getBool('feature_chat')}
                    onChange={v => setBool('feature_chat', v)}
                    label="Chat Integrado"
                    description="Mensagens internas entre compradores e vendedores."
                  />

                  <Toggle
                    checked={getBool('feature_kyc')}
                    onChange={v => setBool('feature_kyc', v)}
                    label="Verificação KYC (Selo Azul)"
                    description="Permite envio de documentos para verificação de identidade."
                  />
                </div>
              )}

              {/* ══ ABA: GATEWAYS DE PAGAMENTO ═══════════════════════════ */}
              {activeTab === 'gateways' && (
                <div className="cfg-fields">
                  <p className="cfg-section-title">🌍 Roteamento de Gateway</p>

                  <FieldGroup
                    label="Gateway Padrão Nacional"
                    hint="Usado para assinantes com endereço no Brasil"
                  >
                    <select
                      className="adm-select"
                      value={get('gateway_nacional_padrao', 'stripe')}
                      onChange={e => set('gateway_nacional_padrao', e.target.value)}
                    >
                      <option value="stripe">Stripe</option>
                      <option value="mercadopago">Mercado Pago</option>
                      <option value="pagarme">Pagar.me</option>
                      <option value="asaas">Asaas</option>
                    </select>
                  </FieldGroup>

                  <FieldGroup
                    label="Gateway Padrão Internacional"
                    hint="Usado para assinantes fora do Brasil. Pagar.me e Asaas não suportam internacional."
                  >
                    <select
                      className="adm-select"
                      value={get('gateway_internacional_padrao', 'stripe')}
                      onChange={e => set('gateway_internacional_padrao', e.target.value)}
                    >
                      <option value="stripe">Stripe</option>
                      <option value="mercadopago">Mercado Pago</option>
                    </select>
                  </FieldGroup>

                  <div className="cfg-gw-info-box">
                    <strong>🌐 Regra de seleção automática:</strong>
                    Brasil → Gateway Nacional Padrão | Internacional → Gateway Internacional Padrão
                  </div>

                  <p className="cfg-section-title" style={{ marginTop: '20px' }}>💳 Credenciais dos Gateways</p>

                  {/* Stripe */}
                  <div className="cfg-gateway-block">
                    <div className="cfg-gateway-header">
                      <span>Stripe</span>
                      <span className="cfg-gateway-badge cfg-gateway-badge--stripe">stripe</span>
                      <div style={{ flex: 1 }} />
                      {estaPreenchido('stripe_secret_key') ? (
                        <span className="cfg-gateway-status cfg-gateway-status--ok">🟢 Configurado</span>
                      ) : (
                        <span className="cfg-gateway-status cfg-gateway-status--missing">🔴 Não configurado</span>
                      )}
                    </div>

                    <PasswordField
                      label="Publishable Key (pk_...)"
                      value={get('stripe_pub_key')}
                      onChange={v => set('stripe_pub_key', v)}
                      placeholder="pk_test_..."
                    />
                    <PasswordField
                      label="Secret Key (sk_...)"
                      hint="Nunca compartilhe — usada somente no servidor."
                      value={get('stripe_secret_key')}
                      onChange={v => set('stripe_secret_key', v)}
                      jaConfigurado={estaPreenchido('stripe_secret_key')}
                      placeholder="sk_test_..."
                    />
                    <PasswordField
                      label="Webhook Secret (whsec_...)"
                      hint="Gerado no painel do Stripe em Webhooks."
                      value={get('stripe_webhook_secret')}
                      onChange={v => set('stripe_webhook_secret', v)}
                      jaConfigurado={estaPreenchido('stripe_webhook_secret')}
                      placeholder="whsec_..."
                    />
                  </div>

                  {/* Mercado Pago */}
                  <div className="cfg-gateway-block">
                    <div className="cfg-gateway-header">
                      <span>Mercado Pago</span>
                      <span className="cfg-gateway-badge cfg-gateway-badge--mp">mercadopago</span>
                      <div style={{ flex: 1 }} />
                      {estaPreenchido('mp_access_token') ? (
                        <span className="cfg-gateway-status cfg-gateway-status--ok">🟢 Configurado</span>
                      ) : (
                        <span className="cfg-gateway-status cfg-gateway-status--missing">🔴 Não configurado</span>
                      )}
                    </div>

                    <PasswordField
                      label="Public Key"
                      value={get('mp_public_key')}
                      onChange={v => set('mp_public_key', v)}
                      placeholder="TEST-xxxxxxxx-..."
                    />
                    <PasswordField
                      label="Access Token"
                      hint="Chave privada — nunca exponha no front-end."
                      value={get('mp_access_token')}
                      onChange={v => set('mp_access_token', v)}
                      jaConfigurado={estaPreenchido('mp_access_token')}
                      placeholder="TEST-xxxxxx..."
                    />
                    <PasswordField
                      label="Webhook Secret"
                      hint="Mercado Pago Dashboard → Suas Integrações → Configuração de Notificações → Chave secreta"
                      value={get('mp_webhook_secret')}
                      onChange={v => set('mp_webhook_secret', v)}
                      jaConfigurado={estaPreenchido('mp_webhook_secret')}
                      placeholder=""
                    />
                  </div>

                  {/* Pagar.me */}
                  <div className="cfg-gateway-block">
                    <div className="cfg-gateway-header">
                      <span>Pagar.me</span>
                      <span className="cfg-gateway-badge cfg-gateway-badge--pagarme">pagar.me</span>
                      <div style={{ flex: 1 }} />
                      {estaPreenchido('pagarme_api_key') ? (
                        <span className="cfg-gateway-status cfg-gateway-status--ok">🟢 Configurado</span>
                      ) : (
                        <span className="cfg-gateway-status cfg-gateway-status--missing">🔴 Não configurado</span>
                      )}
                    </div>

                    <PasswordField
                      label="API Key (sk_...)"
                      value={get('pagarme_api_key')}
                      onChange={v => set('pagarme_api_key', v)}
                      jaConfigurado={estaPreenchido('pagarme_api_key')}
                      placeholder="sk_test_..."
                    />
                    <PasswordField
                      label="Public Key (pk_...)"
                      value={get('pagarme_pub_key')}
                      onChange={v => set('pagarme_pub_key', v)}
                      placeholder="pk_test_..."
                    />
                    <PasswordField
                      label="Webhook Usuário:Senha"
                      hint="Painel Pagar.me → Configurações → Webhooks → 'Habilitar autenticação' — cole aqui como usuario:senha (confirmado ao vivo, 2026-09-02: é Basic Auth simples, não HMAC)"
                      value={get('pagarme_webhook_secret')}
                      onChange={v => set('pagarme_webhook_secret', v)}
                      jaConfigurado={estaPreenchido('pagarme_webhook_secret')}
                      placeholder="usuario:senha"
                    />
                  </div>

                  {/* Asaas */}
                  <div className="cfg-gateway-block">
                    <div className="cfg-gateway-header">
                      <span>Asaas</span>
                      <span className="cfg-gateway-badge" style={{ background: '#0047FF22', color: '#0047FF' }}>asaas</span>
                      <div style={{ flex: 1 }} />
                      {estaPreenchido('asaas_api_key') ? (
                        <span className="cfg-gateway-status cfg-gateway-status--ok">🟢 Configurado</span>
                      ) : (
                        <span className="cfg-gateway-status cfg-gateway-status--missing">🔴 Não configurado</span>
                      )}
                    </div>

                    <FieldGroup label="Ambiente" hint="Use sandbox para testes, production para cobranças reais">
                      <select
                        className="adm-select"
                        value={get('asaas_environment', 'sandbox')}
                        onChange={e => set('asaas_environment', e.target.value)}
                      >
                        <option value="sandbox">Sandbox (Teste)</option>
                        <option value="production">Production (Real)</option>
                      </select>
                    </FieldGroup>
                    <PasswordField
                      label="API Key"
                      hint="Dashboard Asaas → Minha Conta → Chaves de API"
                      value={get('asaas_api_key')}
                      onChange={v => set('asaas_api_key', v)}
                      jaConfigurado={estaPreenchido('asaas_api_key')}
                      placeholder=""
                    />
                    <PasswordField
                      label="Webhook Token"
                      hint="Token estático para validar notificações recebidas do Asaas"
                      value={get('asaas_webhook_token')}
                      onChange={v => set('asaas_webhook_token', v)}
                      jaConfigurado={estaPreenchido('asaas_webhook_token')}
                      placeholder=""
                    />
                  </div>
                </div>
              )}

              {/* ══ ABA: ARMAZENAMENTO ═══════════════════════════════════ */}
              {activeTab === 'storage' && (
                <div className="cfg-fields">
                  <p className="cfg-section-title">🗄️ Política de Retenção de Mídia</p>

                  <div className="cfg-info-box">
                    <h4>Política de 6 meses</h4>
                    <p>
                      Mídias de anúncios cancelados ou arquivados há mais de 180 dias são
                      processadas diariamente. Avatares e documentos KYC estão blindados
                      e nunca são excluídos automaticamente.
                    </p>
                  </div>

                  <FieldGroup label="Estratégia de Retenção">
                    <select
                      className="adm-select"
                      value={get('retention_strategy', 'metadata')}
                      onChange={e => set('retention_strategy', e.target.value)}
                    >
                      <option value="metadata">Opção A — Destruir mídia (salvar metadados JSON)</option>
                      <option value="cold_storage">Opção B — Mover para Cold Storage (S3/B2)</option>
                    </select>
                  </FieldGroup>

                  {get('retention_strategy') === 'cold_storage' && (
                    <div className="cfg-gateway-block">
                      <div className="cfg-gateway-header">
                        <span>Credenciais de Cold Storage</span>
                      </div>

                      <FieldGroup label="Provedor S3 Compatível">
                        <select
                          className="adm-select"
                          value={get('s3_provider', 'aws')}
                          onChange={e => set('s3_provider', e.target.value)}
                        >
                          <option value="aws">Amazon AWS Glacier / S3</option>
                          <option value="backblaze">Backblaze B2</option>
                          <option value="digitalocean">DigitalOcean Spaces</option>
                        </select>
                      </FieldGroup>

                      <FieldGroup label="Endpoint / Região">
                        <input
                          type="text"
                          className="adm-input"
                          value={get('s3_endpoint')}
                          onChange={e => set('s3_endpoint', e.target.value)}
                          placeholder="s3.us-east-1.amazonaws.com"
                        />
                      </FieldGroup>

                      <FieldGroup label="Nome do Bucket">
                        <input
                          type="text"
                          className="adm-input"
                          value={get('s3_bucket')}
                          onChange={e => set('s3_bucket', e.target.value)}
                          placeholder="meu-bucket-frio"
                        />
                      </FieldGroup>

                      <PasswordField
                        label="Access Key ID"
                        value={get('s3_access_key')}
                        onChange={v => set('s3_access_key', v)}
                      />

                      <PasswordField
                        label="Secret Access Key"
                        value={get('s3_secret_key')}
                        onChange={v => set('s3_secret_key', v)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── Botão Salvar ── */}
              <div className="cfg-save-bar">
                <button
                  type="submit"
                  className="adm-btn adm-btn--primary"
                  disabled={saving}
                  style={{ minWidth: 160 }}
                >
                  {saving ? (
                    <>
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                      </svg>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                      </svg>
                      Salvar Alterações
                    </>
                  )}
                </button>
                {isDirty ? (
                  <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--adm-amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    Alterações não salvas
                  </span>
                ) : (
                  <span style={{ fontSize: '.8rem', color: 'var(--adm-text-light)' }}>
                    Alterações aplicadas imediatamente após salvar.
                  </span>
                )}
              </div>

            </form>
          )}

        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
