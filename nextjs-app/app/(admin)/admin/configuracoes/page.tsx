'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function AdminConfiguracoes() {
  const [activeTab, setActiveTab] = useState('brand')
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    const supabase = getSupabase()
    const { data, error } = await supabase.from('platform_settings').select('*')
    if (!error && data) {
      const obj: Record<string, string> = {}
      data.forEach(item => { obj[item.key] = item.value })
      setSettings(obj)
    }
    setLoading(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = getSupabase()

    // Save each setting to platform_settings table
    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString()
    }))

    const { error } = await supabase.from('platform_settings').upsert(updates, { onConflict: 'key' })
    if (!error) {
      alert('Configurações salvas com sucesso!')
    } else {
      alert('Erro ao salvar: ' + error.message)
    }
    setSaving(false)
  }

  const handleChange = (key: string, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [key]: typeof value === 'boolean' ? (value ? 'true' : 'false') : value }))
  }

  const getBool = (key: string) => settings[key] === 'true'

  return (
    <>
      <div className="adm-page-header">
        <h1 className="adm-page-title">Configurações Premium</h1>
        <p className="adm-page-sub">Gestão centralizada de aparência e comportamento do portal.</p>
      </div>

      <div className="adm-card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start' }}>
          
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px' }}>
            <button className={`adm-btn ${activeTab === 'brand' ? 'adm-btn--primary' : 'adm-btn--outline'}`} onClick={() => setActiveTab('brand')} style={{ justifyContent: 'flex-start' }}>🎨 Aparência da Marca</button>
            <button className={`adm-btn ${activeTab === 'home' ? 'adm-btn--primary' : 'adm-btn--outline'}`} onClick={() => setActiveTab('home')} style={{ justifyContent: 'flex-start' }}>🏠 Página Inicial</button>
            <button className={`adm-btn ${activeTab === 'features' ? 'adm-btn--primary' : 'adm-btn--outline'}`} onClick={() => setActiveTab('features')} style={{ justifyContent: 'flex-start' }}>⚙️ Recursos Extras</button>
            <button className={`adm-btn ${activeTab === 'gateways' ? 'adm-btn--primary' : 'adm-btn--outline'}`} onClick={() => setActiveTab('gateways')} style={{ justifyContent: 'flex-start' }}>💳 Gateways de Pagamento</button>
          </nav>

          <form onSubmit={handleSave} style={{ flex: 1, maxWidth: '800px' }}>
            {loading ? (
              <div>Carregando...</div>
            ) : (
              <>
                {/* BRAND TAB */}
                {activeTab === 'brand' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="adm-field">
                      <label>URL do Logotipo</label>
                      <input type="text" className="adm-input" value={settings.logo_url || ''} onChange={e => handleChange('logo_url', e.target.value)} placeholder="https://..." />
                    </div>
                    <div className="adm-field">
                      <label>Cor Primária (Hexadecimal)</label>
                      <input type="color" className="adm-input" value={settings.primary_color || '#16A34A'} onChange={e => handleChange('primary_color', e.target.value)} style={{ padding: '4px 8px', height: '40px' }} />
                    </div>
                    <div className="adm-field">
                      <label>Modo Escuro (Dark Mode Padrão)</label>
                      <select className="adm-select" value={settings.dark_mode || 'auto'} onChange={e => handleChange('dark_mode', e.target.value)}>
                        <option value="auto">Automático (Sistema)</option>
                        <option value="dark">Sempre Escuro</option>
                        <option value="light">Sempre Claro</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* HOME TAB */}
                {activeTab === 'home' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="adm-field">
                      <label>Título do Banner Principal (Hero)</label>
                      <input type="text" className="adm-input" value={settings.hero_title || ''} onChange={e => handleChange('hero_title', e.target.value)} />
                    </div>
                    <div className="adm-field">
                      <label>Subtítulo do Banner</label>
                      <input type="text" className="adm-input" value={settings.hero_subtitle || ''} onChange={e => handleChange('hero_subtitle', e.target.value)} />
                    </div>
                    <div className="adm-field">
                      <label>Banner Principal Visível</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={getBool('show_hero')} onChange={e => handleChange('show_hero', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--adm-accent)' }} />
                        <span>Ativar banner no topo do site</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* FEATURES TAB */}
                {activeTab === 'features' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="adm-field">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={getBool('feature_auctions')} onChange={e => handleChange('feature_auctions', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--adm-accent)' }} />
                        <div style={{ fontWeight: 600 }}>Leilões e Remates</div>
                      </label>
                      <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)', marginTop: '4px' }}>Habilitar aba de leilões ao vivo no site público.</p>
                    </div>
                    <div className="adm-field">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={getBool('feature_chat')} onChange={e => handleChange('feature_chat', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--adm-accent)' }} />
                        <div style={{ fontWeight: 600 }}>Chat Integrado</div>
                      </label>
                      <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)', marginTop: '4px' }}>Permitir mensagens internas entre compradores e vendedores.</p>
                    </div>
                    <div className="adm-field">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={getBool('feature_kyc')} onChange={e => handleChange('feature_kyc', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--adm-accent)' }} />
                        <div style={{ fontWeight: 600 }}>Verificação KYC (Selo Azul)</div>
                      </label>
                      <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)', marginTop: '4px' }}>Permitir envio de documentos para verificação.</p>
                    </div>
                  </div>
                )}

                {/* GATEWAYS TAB */}
                {activeTab === 'gateways' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="adm-field">
                      <label>Stripe Public Key</label>
                      <input type="password" className="adm-input" value={settings.stripe_public || ''} onChange={e => handleChange('stripe_public', e.target.value)} />
                    </div>
                    <div className="adm-field">
                      <label>Mercado Pago Access Token</label>
                      <input type="password" className="adm-input" value={settings.mp_token || ''} onChange={e => handleChange('mp_token', e.target.value)} />
                    </div>
                    <div className="adm-field">
                      <label>Gateway Padrão</label>
                      <select className="adm-select" value={settings.default_gateway || 'stripe'} onChange={e => handleChange('default_gateway', e.target.value)}>
                        <option value="stripe">Stripe</option>
                        <option value="mercadopago">Mercado Pago</option>
                        <option value="pix">PIX Manual</option>
                      </select>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid var(--adm-border)' }}>
                  <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </>
            )}
          </form>

        </div>
      </div>
    </>
  )
}
