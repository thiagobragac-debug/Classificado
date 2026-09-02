'use client'

import React, { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { showToast } from '@/lib/toast'

export default function AdminCupons() {
  const [coupons, setCoupons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15
  // BUG CORRIGIDO: a tela carregava até 100 cupons de uma vez e paginava em
  // memória. Agora a paginação da TABELA roda de verdade no servidor via
  // .range(). Os KPIs continuam vindo de uma busca separada e sem paginação
  // (só as colunas necessárias) porque "ativo e válido" depende de comparar
  // valid_until/usage_count com o momento atual — não dá pra fazer isso só
  // com um count(*) no banco sem uma RPC dedicada, e cupons é uma tabela
  // pequena e curada por admin (nunca chega perto de milhares de linhas).
  const [totalCoupons, setTotalCoupons] = useState(0)
  const [counts, setCounts] = useState({ total: 0, ativas: 0, inativas: 0, totalUsos: 0 })

  const [form, setForm] = useState({
    code: '',
    discount_type: 'percentage',
    discount_value: 0,
    discount_value_usd: '' as string | number,
    valid_until: '',
    max_uses: '' as string | number,
    is_active: true
  })

  useEffect(() => {
    loadCounts()
  }, [])

  useEffect(() => {
    loadCoupons()
  }, [currentPage])

  async function loadCoupons() {
    setLoading(true)
    const supabase = getSupabase()
    const from = (currentPage - 1) * pageSize
    const to = from + pageSize - 1
    const { data, count, error } = await supabase.from('coupons').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to)
    if (!error && data) {
      setCoupons(data)
      if (count !== null) setTotalCoupons(count)
    } else if (error) {
      // GAP CORRIGIDO: falha aqui deixava a tela em "Nenhum cupom criado"
      // sem nenhum aviso — indistinguível de base vazia.
      showToast('Erro ao carregar cupons: ' + error.message, 'error')
    }
    setLoading(false)
  }

  async function loadCounts() {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('coupons').select('is_active, valid_until, usage_count, max_uses').limit(5000)
    if (error) return showToast('Erro ao carregar contadores: ' + error.message, 'error')
    const rows = data || []
    const now = new Date()
    const ativas = rows.filter((c: any) => {
      const expired = c.valid_until && new Date(c.valid_until) < now
      const maxReached = c.max_uses && (c.usage_count || 0) >= c.max_uses
      return c.is_active && !expired && !maxReached
    }).length
    const totalUsos = rows.reduce((acc: number, c: any) => acc + (c.usage_count || 0), 0)
    setCounts({ total: rows.length, ativas, inativas: rows.length - ativas, totalUsos })
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('coupons').update({ is_active: !currentActive }).eq('id', id).select()
    if (!error && data && data.length > 0) {
      setCoupons(coupons.map(c => c.id === id ? { ...c, is_active: !currentActive } : c))
      loadCounts()
    } else if (!error) {
      showToast('Nenhum cupom foi alterado — verifique suas permissões.', 'error')
    } else {
      // GAP CORRIGIDO: erro real do Supabase (rede, etc.) era engolido —
      // a tela ficava com o status antigo sem nenhum aviso ao admin.
      showToast('Erro: ' + error.message, 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este cupom? Ele pode quebrar links ativos.')) return
    const supabase = getSupabase()
    const { data, error } = await supabase.from('coupons').delete().eq('id', id).select()
    if (!error && data && data.length > 0) {
      // Excluir pode deixar a página atual com menos itens que o esperado
      // — recarrega de verdade em vez de só remover localmente. Se o cupom
      // excluído era o único item da página atual e não é a primeira
      // página, volta uma página antes de recarregar — senão a tabela fica
      // vazia com dados só em páginas anteriores.
      if (coupons.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1)
      } else {
        loadCoupons()
      }
      loadCounts()
    } else if (!error) {
      showToast('Nenhum cupom foi excluído — verifique suas permissões.', 'error')
    } else {
      showToast('Erro: ' + error.message, 'error')
    }
  }

  const openNew = () => {
    setEditingId(null)
    setForm({
      code: '', discount_type: 'percentage', discount_value: 0, discount_value_usd: '', valid_until: '', max_uses: '', is_active: true
    })
    setIsModalOpen(true)
  }

  // GAP CORRIGIDO (reteste do site, 2026-08-25): não existia forma de
  // editar um cupom já criado — só criar, ativar/desativar e excluir. Um
  // erro de digitação no valor do desconto ou na data de validade só podia
  // ser corrigido excluindo o cupom e criando outro (quebrando o link que
  // já tivesse sido compartilhado com o código antigo).
  const openEdit = (c: any) => {
    setEditingId(c.id)
    setForm({
      code: c.code,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      discount_value_usd: c.discount_value_usd ?? '',
      // Formata na TZ de Brasil (não UTC): valid_until agora é gravado como
      // 23:59:59 -03:00 (ver handleSave) — com .toISOString().slice(0,10)
      // simples, um cupom válido até 31/08 reabria o form mostrando 01/09.
      valid_until: c.valid_until ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(c.valid_until)) : '',
      max_uses: c.max_uses ?? '',
      is_active: c.is_active
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.code) return showToast('Preencha o código do cupom', 'error')
    if (!isFinite(form.discount_value) || form.discount_value <= 0) return showToast('O desconto deve ser maior que zero', 'error')
    // BUG CORRIGIDO: desconto percentual sem teto — um valor > 100 (erro de
    // digitação ou má-fé) gera preço final NEGATIVO no checkout
    // (app/api/checkout/route.ts), indo pro gateway de cobrança.
    if (form.discount_type === 'percentage' && form.discount_value > 100) return showToast('O desconto percentual não pode ser maior que 100%', 'error')

    // GAP CORRIGIDO (RESOLVER PROBLEMA CUPOM): cupom de valor fixo era
    // cadastrado só em R$ — numa cobrança internacional (Stripe + price_usd,
    // ver plans.price_usd) o valor fixo simplesmente não se aplicava, sem
    // aviso nenhum (ver comentário na migration 20260901130000). Campo
    // opcional: sem ele, cupom fixo continua sem efeito em USD (mesmo
    // comportamento de antes), mas agora o checkout avisa em vez de fingir
    // que aplicou.
    const usdValue = form.discount_value_usd === '' ? null : Number(form.discount_value_usd)
    if (form.discount_type === 'fixed' && usdValue !== null && (!isFinite(usdValue) || usdValue <= 0)) {
      return showToast('O desconto em dólar deve ser maior que zero', 'error')
    }

    const supabase = getSupabase()
    const payload = {
      code: form.code.toUpperCase(),
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      // Percentual não tem equivalente em moeda — não faz sentido gravar
      // discount_value_usd pra esse tipo (funciona em qualquer moeda pelo
      // próprio percentual).
      discount_value_usd: form.discount_type === 'fixed' ? usdValue : null,
      is_active: form.is_active,
      // BUG CORRIGIDO: new Date('2026-08-31').toISOString() é meia-noite UTC
      // — 21h do dia 30 em Brasília (UTC-3). Um cupom "válido até 31/08"
      // expirava ~3h antes da meia-noite real desse dia para qualquer
      // comparação feita aqui (ver `expired` acima) ou em
      // app/api/checkout/validate-coupon e app/api/checkout/route.ts.
      // Offset explícito -03:00 = fim do dia em horário de Brasília.
      valid_until: form.valid_until ? new Date(`${form.valid_until}T23:59:59-03:00`).toISOString() : null,
      max_uses: form.max_uses === '' ? null : Number(form.max_uses)
    }

    if (editingId) {
      const { data, error } = await supabase.from('coupons').update(payload).eq('id', editingId).select().single()
      if (!error && data) {
        setCoupons(coupons.map(c => c.id === editingId ? data : c))
        setIsModalOpen(false)
        setEditingId(null)
        showToast('Cupom atualizado!', 'success')
        loadCounts()
      } else {
        showToast('Erro: ' + error?.message, 'error')
      }
      return
    }

    const { data, error } = await supabase.from('coupons').insert(payload).select().single()
    if (!error && data) {
      setIsModalOpen(false)
      showToast('Cupom criado!', 'success')
      // Um cupom novo entra no topo (created_at desc) — só aparece na
      // página 1; recarrega de verdade em vez de inserir otimisticamente
      // numa página que pode não ser a atual.
      if (currentPage !== 1) setCurrentPage(1)
      else loadCoupons()
      loadCounts()
    } else {
      showToast('Erro: ' + error?.message, 'error')
    }
  }

  // KPIs: globais, vindos de loadCounts() — não dependem da página atual
  const { total, ativas, inativas, totalUsos } = counts

  const totalPages = Math.ceil(totalCoupons / pageSize)

  return (
    <>
      <div className="adm-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="adm-page-title">Cupons de Desconto</h1>
          <p className="adm-page-sub">Crie campanhas e cupons de desconto para os planos.</p>
        </div>
        <button className="adm-btn adm-btn--primary" onClick={openNew}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Cupom
        </button>
      </div>

      <div className="adm-stats-grid" style={{ marginBottom: '24px' }}>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{total}</div><div className="adm-stat-lbl">Total de Cupons</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-accent)' }}>{ativas}</div><div className="adm-stat-lbl">Ativos e Válidos</div></div>
          <div className="adm-stat-icon adm-stat-icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val" style={{ color: 'var(--adm-amber)' }}>{inativas}</div><div className="adm-stat-lbl">Inativos / Vencidos</div></div>
          <div className="adm-stat-icon adm-stat-icon--amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div>
        </div>
        <div className="adm-stat-card">
          <div><div className="adm-stat-val">{totalUsos}</div><div className="adm-stat-lbl">Total de Usos</div></div>
          <div className="adm-stat-icon adm-stat-icon--blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        </div>
      </div>

      <div className="adm-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-table" style={{ width: '100%', textAlign: 'left' }}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Desconto</th>
                <th>Usos / Limite</th>
                <th>Validade</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Carregando cupons...</td></tr>
              ) : coupons.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Nenhum cupom criado.</td></tr>
              ) : coupons.map(c => {
                const expired = c.valid_until && new Date(c.valid_until) < new Date()
                const maxReached = c.max_uses && c.usage_count >= c.max_uses
                return (
                  <tr key={c.id}>
                    <td><strong style={{ letterSpacing: '1px' }}>{c.code}</strong></td>
                    <td style={{ fontWeight: 600, color: 'var(--adm-green)' }}>
                      {c.discount_type === 'percentage' ? `${c.discount_value}%` : `R$ ${c.discount_value}`}
                      {c.discount_type === 'fixed' && (
                        <div style={{ fontSize: '0.75rem', fontWeight: 500, color: c.discount_value_usd != null ? 'var(--adm-text-secondary)' : 'var(--adm-amber)' }}>
                          {c.discount_value_usd != null ? `US$ ${c.discount_value_usd} intl.` : 'sem valor em US$'}
                        </div>
                      )}
                    </td>
                    <td>{c.usage_count} {c.max_uses ? `/ ${c.max_uses}` : '(Ilimitado)'}</td>
                    <td>
                      {c.valid_until ? (
                        <span style={{ color: expired ? 'var(--adm-red)' : 'inherit' }}>
                          {new Date(c.valid_until).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </span>
                      ) : 'Sem validade'}
                    </td>
                    <td>
                      {c.is_active && !expired && !maxReached ? <span className="adm-badge adm-badge--green">Ativo</span> :
                       <span className="adm-badge adm-badge--amber">Inativo</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => openEdit(c)}>Editar</button>
                        {/* BUG CORRIGIDO: o rótulo do botão olhava só a coluna
                            is_active bruta, enquanto o badge de Status ao
                            lado já considera expirado/esgotado. Um cupom
                            com is_active=true mas esgotado mostrava
                            "Inativo" no badge e "Desativar" no botão ao
                            mesmo tempo — contraditório para quem está lendo
                            a linha. Agora os dois usam a mesma condição. */}
                        <button className="adm-btn adm-btn--sm adm-btn--outline" onClick={() => handleToggleActive(c.id, c.is_active)}>
                          {c.is_active && !expired && !maxReached ? 'Desativar' : 'Ativar'}
                        </button>
                        <button className="adm-btn adm-btn--sm adm-btn--outline" style={{ color: 'var(--adm-red)', borderColor: 'var(--adm-red)' }} onClick={() => handleDelete(c.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* PAGINATION FOOTER */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--adm-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--adm-surface)', borderRadius: '0 0 var(--adm-r-xl) var(--adm-r-xl)' }}>
          <div style={{ fontSize: '14px', color: 'var(--adm-text-secondary)' }}>
            Mostrando de <strong style={{ color: 'var(--adm-text)' }}>{totalCoupons === 0 ? 0 : ((currentPage - 1) * pageSize) + 1}</strong> até <strong style={{ color: 'var(--adm-text)' }}>{Math.min(currentPage * pageSize, totalCoupons)}</strong> de <strong style={{ color: 'var(--adm-text)' }}>{totalCoupons}</strong> itens
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
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="adm-overlay" style={{ display: 'flex' }} onClick={e => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="adm-modal" style={{ maxWidth: '500px', width: '100%', padding: '24px' }}>
            <h3 className="adm-modal-title" style={{ marginTop: 0 }}>{editingId ? 'Editar Cupom' : 'Criar Novo Cupom'}</h3>
            
            <div className="adm-field">
              <label>Código do Cupom</label>
              <input type="text" className="adm-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="Ex: BLACK50" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="adm-field">
                <label>Tipo de Desconto</label>
                <select className="adm-select" value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value })}>
                  <option value="percentage">Porcentagem (%)</option>
                  <option value="fixed">Valor Fixo (R$)</option>
                </select>
              </div>
              <div className="adm-field">
                <label>Valor ({form.discount_type === 'percentage' ? '%' : 'R$'})</label>
                <input type="number" className="adm-input" max={form.discount_type === 'percentage' ? 100 : undefined} value={form.discount_value} onChange={e => setForm({ ...form, discount_value: parseFloat(e.target.value) })} />
              </div>
            </div>

            {/* GAP CORRIGIDO (RESOLVER PROBLEMA CUPOM): cupom fixo em R$ não
                tinha equivalente em USD — checkout internacional (Stripe +
                plans.price_usd) simplesmente ignorava o desconto, sem
                avisar. Campo opcional só pra tipo "fixed"; percentual já
                funciona em qualquer moeda pelo próprio percentual. */}
            {form.discount_type === 'fixed' && (
              <div className="adm-field">
                <label>Valor Fixo em Dólar — US$ (Opcional)</label>
                <input
                  type="number" className="adm-input" min={0} step="0.01"
                  value={form.discount_value_usd}
                  onChange={e => setForm({ ...form, discount_value_usd: e.target.value })}
                  placeholder="Deixe em branco para não aplicar a cobranças em dólar"
                />
                <p style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)', marginTop: '4px' }}>
                  Sem este valor, o cupom não desconta nada em cobranças internacionais (Stripe/USD) — só nas em R$.
                </p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="adm-field">
                <label>Limite de Usos (Opcional)</label>
                <input type="number" className="adm-input" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} placeholder="Ilimitado" />
              </div>
              <div className="adm-field">
                <label>Válido até (Opcional)</label>
                <input type="date" className="adm-input" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button className="adm-btn adm-btn--outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="adm-btn adm-btn--primary" onClick={handleSave}>{editingId ? 'Salvar Alterações' : 'Criar Cupom'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
