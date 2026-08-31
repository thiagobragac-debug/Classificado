'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase, getSession, safeFileExt } from '@/lib/supabase'
import { showToast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmProvider'

// GAP CORRIGIDO (achado de usabilidade #3): "Local Alvo" era texto livre pra
// Estado/País, mas o filtro público (getBanners() em lib/supabase.ts) compara
// com o valor normalizado vindo da geolocalização do visitante — grafias que
// não batessem exatamente (acentuação, abreviação, digitação livre) faziam o
// banner nunca aparecer pra ninguém. Listas fixas por país garantem que todo
// banner novo grava um valor normalizado e consistente, mesmo espírito do
// campo de cidade estruturado logo abaixo. Mesmo conjunto de nomes canônicos
// usado em app/(public)/anunciar/_components/StepLocation.tsx (não
// importado daqui de propósito: esse componente é local ao wizard público,
// fora da área desta tela de admin).
const MERCOSUL_COUNTRIES = ['Brasil', 'Argentina', 'Uruguai', 'Paraguai']

const BR_STATE_NAMES = [
  'Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal',
  'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul',
  'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí',
  'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia',
  'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins',
]

const AR_PROVINCES = [
  'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut',
  'Ciudad Autónoma de Buenos Aires', 'Córdoba', 'Corrientes', 'Entre Ríos',
  'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones',
  'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz',
  'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
]

const UY_DEPARTMENTS = [
  'Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores',
  'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú',
  'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano',
  'Tacuarembó', 'Treinta y Tres',
]

const PY_DEPARTMENTS = [
  'Concepción', 'San Pedro', 'Cordillera', 'Guairá', 'Caaguazú', 'Caazapá',
  'Itapúa', 'Misiones', 'Paraguarí', 'Alto Paraná', 'Central', 'Ñeembucú',
  'Amambay', 'Canindeyú', 'Presidente Hayes', 'Boquerón', 'Alto Paraguay',
  'Asunción',
]

// Lista única (deduplicada — 'Misiones' e 'Río Negro' existem em mais de um
// país) e ordenada, já que o alvo "Estado" do banner não distingue país.
const MERCOSUL_STATES = Array.from(
  new Set([...BR_STATE_NAMES, ...AR_PROVINCES, ...UY_DEPARTMENTS, ...PY_DEPARTMENTS])
).sort((a, b) => a.localeCompare(b, 'pt'))

export default function AdminBanners() {
  const { confirm } = useConfirm()
  const [banners, setBanners] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15
  // BUG CORRIGIDO: a tela carregava até 1.500 banners de uma vez e paginava
  // em memória. Agora a paginação roda de verdade no servidor via .range(),
  // e os KPIs vêm de contagens globais separadas, não do array já paginado.
  const [totalBanners, setTotalBanners] = useState(0)
  const [counts, setCounts] = useState({ ativos: 0, inativos: 0, globais: 0 })

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  const [form, setForm] = useState({
    name: '',
    position: 'home_top',
    status: 'active',
    image_url: '',
    link_url: '',
    target_type: 'global',
    target_location: ''
  })

  useEffect(() => {
    loadCounts()
  }, [])

  useEffect(() => {
    loadBanners()
  }, [currentPage])

  async function loadBanners() {
    setLoading(true)
    const supabase = getSupabase()
    const from = (currentPage - 1) * pageSize
    const to = from + pageSize - 1
    const { data, count, error } = await supabase.from('banners').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to)
    if (!error && data) {
      setBanners(data)
      if (count !== null) setTotalBanners(count)
    } else if (error) {
      // GAP CORRIGIDO: falha aqui deixava a tela em "Nenhum banner
      // encontrado" sem nenhum aviso — indistinguível de base vazia.
      showToast('Erro ao carregar banners: ' + error.message, 'error')
    }
    setLoading(false)
  }

  async function loadCounts() {
    const supabase = getSupabase()
    const [r1, r2, r3] = await Promise.all([
      supabase.from('banners').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('banners').select('*', { count: 'exact', head: true }).eq('status', 'inactive'),
      supabase.from('banners').select('*', { count: 'exact', head: true }).eq('target_type', 'global'),
    ])
    const firstError = [r1, r2, r3].find(r => r.error)?.error
    if (firstError) showToast('Erro ao carregar contadores: ' + firstError.message, 'error')
    setCounts({ ativos: r1.count || 0, inativos: r2.count || 0, globais: r3.count || 0 })
  }

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    const supabase = getSupabase()
    // GAP CORRIGIDO (reteste do site, 2026-08-25): update().eq() sem
    // .select() retorna { error: null } mesmo sem alterar nenhuma linha
    // (ex.: RLS bloqueando silenciosamente) — a UI trocava o status
    // localmente como se tivesse funcionado, mesmo sem gravar no banco.
    const { data, error } = await supabase.from('banners').update({ status: newStatus }).eq('id', id).select()
    if (!error && data && data.length > 0) {
      setBanners(banners.map(b => b.id === id ? { ...b, status: newStatus } : b))
      loadCounts()
    } else if (!error) {
      showToast('Nenhum banner foi alterado — verifique suas permissões.', 'error')
    } else {
      showToast('Erro: ' + error.message, 'error')
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    const supabase = getSupabase()
    const session = await getSession()
    if (!session) {
      showToast('Sessão expirada — faça login novamente.', 'error')
      setUploadingImage(false)
      return
    }
    const ext = safeFileExt(file.name)
    // uid como primeiro segmento do path: a policy de INSERT do bucket
    // ad-images exige (storage.foldername(name))[1] = auth.uid() (ver
    // correção em lib/supabase.ts uploadAdImage) — sem isso o upload
    // sempre falhava com RLS antes de chegar a mostrar erro específico.
    const fileName = `${session.user.id}/banners/${Date.now()}_${Math.random().toString(36).substring(2,7)}.${ext}`

    const { error } = await supabase.storage.from('ad-images').upload(fileName, file)
    if (error) {
      showToast('Erro no upload: ' + error.message, 'error')
    } else {
      const { data: { publicUrl } } = supabase.storage.from('ad-images').getPublicUrl(fileName)
      setForm(prev => ({ ...prev, image_url: publicUrl }))
      showToast('Imagem carregada com sucesso!', 'success')
    }
    setUploadingImage(false)
  }

  const handleDelete = async (id: string) => {
    if (!(await confirm('Deseja realmente excluir este banner?'))) return
    const supabase = getSupabase()
    const { data, error } = await supabase.from('banners').delete().eq('id', id).select()
    if (!error && data && data.length > 0) {
      // Excluir pode deixar a página atual com menos itens que o esperado
      // — recarrega de verdade em vez de só remover localmente. Se o
      // banner excluído era o único item da página atual e não é a
      // primeira página, volta uma página antes de recarregar — senão a
      // tabela fica vazia com dados só em páginas anteriores.
      if (banners.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1)
      } else {
        loadBanners()
      }
      loadCounts()
    } else if (!error) {
      showToast('Nenhum banner foi excluído — verifique suas permissões.', 'error')
    } else {
      showToast('Erro ao excluir: ' + error.message, 'error')
    }
  }

  const openNew = () => {
    setEditingId(null)
    setForm({
      name: '', position: 'home_top', status: 'active', image_url: '', link_url: '', target_type: 'global', target_location: ''
    })
    setIsModalOpen(true)
  }

  const openEdit = (b: any) => {
    setEditingId(b.id)
    setForm({
      name: b.name || '',
      position: b.position || 'home_top',
      status: b.status || 'active',
      image_url: b.image_url || '',
      link_url: b.link_url || '',
      target_type: b.target_type || 'global',
      target_location: b.target_location || ''
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.image_url) return showToast('Preencha o nome e a URL da imagem', 'error')
    
    const supabase = getSupabase()
    const payload = {
      ...form
    }

    if (editingId) {
      const { data, error } = await supabase.from('banners').update(payload).eq('id', editingId).select()
      if (!error && data && data.length > 0) {
        setBanners(banners.map(b => b.id === editingId ? { ...b, ...payload } : b))
        setIsModalOpen(false)
        showToast('Banner atualizado!', 'success')
        loadCounts()
      } else if (!error) {
        showToast('Nenhum banner foi alterado — verifique suas permissões.', 'error')
      } else {
        showToast('Erro: ' + error.message, 'error')
      }
    } else {
      const { data, error } = await supabase.from('banners').insert(payload).select().single()
      if (!error && data) {
        setIsModalOpen(false)
        showToast('Banner criado!', 'success')
        // Um banner novo entra no topo (created_at desc) — só aparece na
        // página 1; recarrega de verdade em vez de inserir otimisticamente
        // numa página que pode não ser a atual.
        if (currentPage !== 1) setCurrentPage(1)
        else loadBanners()
        loadCounts()
      } else {
        showToast('Erro: ' + error?.message, 'error')
      }
    }
  }

  // KPIs: globais, vindos de loadCounts() — não dependem da página atual
  const { ativos, inativos, globais } = counts
  const total = totalBanners

  const totalPages = Math.ceil(totalBanners / pageSize)

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Gestão de Banners</h1>
          <p className="adm-page-sub">Monetize o portal gerenciando os anúncios e banners publicitários.</p>
        </div>
        <button className="adm-btn adm-btn--primary" onClick={openNew}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Banner
        </button>
      </div>

      <div className="adm-stats-grid" style={{ marginBottom: '20px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total de Banners</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-green)' }}>{ativos}</div><div className="adm-stat-lbl">Ativos</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{inativos}</div><div className="adm-stat-lbl">Inativos / Pausados</div></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{globais}</div><div className="adm-stat-lbl">Globais</div></div>
        </div>
      </div>

      <div className="adm-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-table" style={{ width: '100%', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Visualização</th>
                <th>Nome da Campanha</th>
                <th>Posição / Alvo</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Carregando banners...</td></tr>
              ) : banners.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Nenhum banner encontrado.</td></tr>
              ) : banners.map(b => (
                <tr key={b.id}>
                  <td>
                    {b.image_url ? (
                      <div style={{ width: '100px', height: '50px', backgroundImage: `url(${b.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '4px', border: '1px solid var(--adm-border)' }}></div>
                    ) : (
                      <div style={{ width: '100px', height: '50px', background: 'var(--adm-surface-2)', borderRadius: '4px', border: '1px solid var(--adm-border)' }}></div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.name}</div>
                    {b.link_url && <a href={b.link_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: 'var(--adm-primary)', textDecoration: 'none' }} title={b.link_url}>🔗 Ver Link</a>}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>Posição: <strong style={{ color: 'var(--adm-text)' }}>{b.position}</strong></div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--adm-text-muted)' }}>Alvo: {b.target_type} {b.target_location ? `(${b.target_location.replace('|', ' - ')})` : ''}</div>
                  </td>
                  <td>
                    {b.status === 'active' ? <span className="adm-badge adm-badge--green">Ativo</span> : <span className="adm-badge adm-badge--amber">Inativo</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => openEdit(b)}>Editar</button>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleToggleStatus(b.id, b.status)}>
                        {b.status === 'active' ? 'Pausar' : 'Ativar'}
                      </button>
                      <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleDelete(b.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* PAGINATION FOOTER */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--adm-surface)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
            <div style={{ fontSize: '14px', color: 'var(--adm-text-secondary)' }}>
              Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{totalBanners === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, totalBanners)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{totalBanners}</strong> itens
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                className="adm-btn adm-btn--outline adm-btn--sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                Anterior
              </button>
              
              {Array.from({ length: totalPages }).map((_, i) => {
                if (totalPages > 7) {
                  if (i !== 0 && i !== totalPages - 1 && Math.abs(currentPage - 1 - i) > 1) {
                    if (Math.abs(currentPage - 1 - i) === 2) return <span key={i} style={{ padding: '0 8px', color: 'var(--adm-text-secondary)' }}>...</span>
                    return null
                  }
                }
                
                return (
                  <button 
                    key={i} 
                    className={`adm-btn adm-btn--sm ${currentPage === i + 1 ? 'adm-btn--primary' : 'adm-btn--outline'}`}
                    style={{ width: '36px', height: '36px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setCurrentPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                )
              })}

              <button 
                className="adm-btn adm-btn--outline adm-btn--sm" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                Próxima
              </button>
            </div>
          </div>
      </div>

      {isModalOpen && (
        <div className="adm-overlay" style={{ display: 'flex' }} onClick={e => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="adm-modal" style={{ maxWidth: '600px', width: '100%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* 1. FIXED HEADER */}
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--adm-border)' }}>
              <h3 className="adm-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--adm-accent-pale)', color: 'var(--adm-accent)', display: 'grid', placeItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </div>
                {editingId ? 'Editar Banner' : 'Novo Banner'}
              </h3>
            </div>
            
            {/* 2. SCROLLABLE BODY */}
            <div style={{ padding: '24px 32px', overflowY: 'auto', maxHeight: 'calc(90vh - 160px)' }}>
              <div className="adm-field">
                <label>Nome da Campanha / Anunciante</label>
                <input type="text" className="adm-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Sementes AgroMais" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="adm-field">
                  <label>Posição do Banner</label>
                  <select className="adm-select" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
                    <option value="home_top">Home - Topo (Leaderboard)</option>
                    <option value="home_mid">Home - Meio (Leaderboard)</option>
                    <option value="listagem_sidebar">Listagem - Sidebar (Retângulo)</option>
                    <option value="anuncio_sidebar">Anúncio - Sidebar (Retângulo)</option>
                    <option value="leilao_footer">Leilão - Rodapé (Horizontal)</option>
                  </select>
                  <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', marginTop: '6px' }}>
                    {form.position.includes('sidebar') 
                      ? 'Recomendado: 300x250px ou 300x600px'
                      : 'Recomendado: 1200x120px (Desktop) / 320x100px (Mobile)'}
                  </div>
                </div>
                <div className="adm-field">
                  <label>Status</label>
                  <select className="adm-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--adm-border)' }}>
                <div className="adm-field">
                  <label>Abrangência</label>
                  <select
                    className="adm-select"
                    value={form.target_type}
                    onChange={e => {
                      const newType = e.target.value
                      // GAP CORRIGIDO (achado de usabilidade #4): antes, trocar a
                      // Abrangência limpava target_location no mesmo evento, mesmo
                      // ao editar um banner existente — descartava o texto/seleção
                      // já preenchidos sem nenhum aviso. Agora só limpa quando o
                      // valor atual é realmente incompatível com o novo tipo (o
                      // formato "Cidade|UF" indo pra um tipo que não é cidade, ou
                      // vice-versa); nos demais casos (ex.: trocar entre País e
                      // Estado, ou entrar/sair de Global e Mercosul) o valor
                      // preenchido é preservado.
                      const isCityFormat = form.target_location.includes('|')
                      const goingToCity = newType === 'city'
                      const incompatible = form.target_location !== '' && isCityFormat !== goingToCity
                      setForm({ ...form, target_type: newType, target_location: incompatible ? '' : form.target_location })
                    }}
                  >
                    <option value="global">Global (Todos)</option>
                    <option value="mercosul">Mercosul</option>
                    <option value="country">País</option>
                    <option value="state">Estado / Província</option>
                    <option value="city">Cidade (BR)</option>
                  </select>
                </div>
                {form.target_type === 'country' && (
                  <div className="adm-field">
                    <label>País Alvo</label>
                    <select className="adm-select" value={form.target_location} onChange={e => setForm({ ...form, target_location: e.target.value })}>
                      <option value="">Selecione...</option>
                      {MERCOSUL_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                {form.target_type === 'state' && (
                  <div className="adm-field">
                    <label>Estado / Província Alvo</label>
                    <select className="adm-select" value={form.target_location} onChange={e => setForm({ ...form, target_location: e.target.value })}>
                      <option value="">Selecione...</option>
                      {MERCOSUL_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {form.target_type === 'city' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div className="adm-field" style={{ flex: 2 }}>
                      <label>Cidade</label>
                      {/* Separador '|' em vez de '-': nomes reais de município têm
                          hífen (ex.: Embu-Guaçu/SP) e quebravam tanto a digitação
                          aqui quanto o parsing em getBanners() (lib/supabase.ts). */}
                      <input type="text" className="adm-input" value={form.target_location.split('|')[0] || ''} onChange={e => setForm({ ...form, target_location: `${e.target.value}|${form.target_location.split('|')[1] || ''}` })} placeholder="Ex: São Paulo" />
                    </div>
                    <div className="adm-field" style={{ flex: 1 }}>
                      <label>UF</label>
                      <input type="text" className="adm-input" maxLength={2} value={form.target_location.split('|')[1] || ''} onChange={e => setForm({ ...form, target_location: `${form.target_location.split('|')[0] || ''}|${e.target.value.toUpperCase()}` })} placeholder="SP" />
                    </div>
                  </div>
                )}
              </div>

              <div className="adm-field" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--adm-border)' }}>
                <label>Arte do Banner (Upload ou URL)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" className="adm-input" value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." style={{ flex: 1 }} />
                  <label style={{ 
                    cursor: uploadingImage ? 'not-allowed' : 'pointer', 
                    background: 'var(--adm-surface-2)', 
                    border: '1px solid var(--adm-border)', 
                    borderRadius: '8px', 
                    padding: '0 16px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    fontWeight: 600, 
                    fontSize: '0.9rem',
                    opacity: uploadingImage ? 0.6 : 1,
                    whiteSpace: 'nowrap'
                  }}>
                    {uploadingImage ? '⏳ Enviando...' : '📁 Escolher Arquivo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploadingImage} />
                  </label>
                </div>
              </div>

              <div className="adm-field">
                <label>Link de Destino (Opcional)</label>
                <input type="text" className="adm-input" value={form.link_url} onChange={e => setForm({ ...form, link_url: e.target.value })} placeholder="https://..." />
              </div>

              {form.image_url && (
                <div style={{ marginTop: '12px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Preview da Imagem:</label>
                  <div style={{ width: '100%', height: '100px', backgroundImage: `url(${form.image_url})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', borderRadius: '4px', border: '1px solid var(--adm-border)', marginTop: '4px' }}></div>
                </div>
              )}
            </div>

            {/* 3. FIXED FOOTER */}
            <div className="adm-modal-footer" style={{ margin: 0, padding: '20px 32px', borderTop: '1px solid var(--adm-border)', background: 'var(--adm-surface-2)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>Salvar Banner</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
