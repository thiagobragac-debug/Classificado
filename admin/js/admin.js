/* ─── ADMIN JS ───────────────────────────────
   Tauze Class Admin Panel
   ──────────────────────────────────────────── */

// ─── AUTH (Supabase REST API) ─────────────────
const ADM_SB_URL  = 'https://rfzuzuobwuanmbrcthqe.supabase.co';
const ADM_SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmenV6dW9id3Vhbm1icmN0aHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNzg1OTMsImV4cCI6MjA5ODY1NDU5M30.m-Mop7RgpVo730lwjcra1egF8p9APv6AGnW1YnFvOgY';

// ── Proteção XSS: escape de todo conteúdo dinâmico no DOM ────────
window.escapeHTML = function(str) {
  if (str === null || str === undefined) return '';
  return str.toString().replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
};

/**
 * Decodifica o payload do JWT sem verificação de assinatura.
 * A verificação real é feita pelo Supabase server-side via RLS.
 */
function decodeJWTPayload(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

/**
 * Verifica se a sessão admin é válida e não expirou.
 * Redireciona para login se inválida.
 */
function checkAuth() {
  const raw = sessionStorage.getItem('tc_admin_session');
  if (!raw) {
    if (!window.location.pathname.endsWith('/admin/login.html')) {
      window.location.href = '/admin/login.html';
    }
    return;
  }

  try {
    const session = JSON.parse(raw);
    const payload = decodeJWTPayload(session.token);

    // Verifica expiração do JWT (exp em segundos Unix)
    if (!payload || !payload.exp || Date.now() / 1000 > payload.exp) {
      console.warn('[Admin] Sessão expirada — fazendo logout.');
      sessionStorage.removeItem('tc_admin_session');
      if (!window.location.pathname.endsWith('/admin/login.html')) {
        window.location.href = '/admin/login.html?expired=1';
      }
    }
  } catch {
    sessionStorage.removeItem('tc_admin_session');
    window.location.href = '/admin/login.html';
  }
}

// Verificação automática a cada 5 minutos enquanto o admin estiver ativo
setInterval(checkAuth, 5 * 60 * 1000);

async function adminLogin(email, password) {
  try {
    const res = await fetch(`${ADM_SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': ADM_SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) return false;
    const data = await res.json();

    // Verifica se o usuário tem flag is_admin no perfil
    const profRes = await fetch(`${ADM_SB_URL}/rest/v1/profiles?select=is_admin,name&id=eq.${data.user.id}`, {
      headers: { 'apikey': ADM_SB_ANON, 'Authorization': `Bearer ${data.access_token}` }
    });
    const profData = await profRes.json();
    if (profData && profData[0] && profData[0].is_admin) {
      sessionStorage.setItem('tc_admin_session', JSON.stringify({
        token: data.access_token,
        user:  data.user,
        name:  profData[0].name
      }));
      return true;
    }
    return false;
  } catch (e) {
    console.error('[Admin] Login error', e);
    return false;
  }
}

function adminLogout() {
  sessionStorage.removeItem('tc_admin_session');
  window.location.href = '/admin/login.html';
}

function getAdmin() {
  const session = JSON.parse(sessionStorage.getItem('tc_admin_session') || '{}');
  return { name: session.name || 'Admin', email: session.user?.email || '' };
}

function getAdminToken() {
  const session = JSON.parse(sessionStorage.getItem('tc_admin_session') || '{}');
  return session.token || ADM_SB_ANON;
}

// ── Supabase client para o admin (usa token da sessão) ────────────
let _adminSb = null;
function getSupabase() {
  if (_adminSb) return _adminSb;
  if (typeof window !== 'undefined' && window.supabase) {
    _adminSb = window.supabase.createClient(ADM_SB_URL, ADM_SB_ANON, {
      global: { headers: { Authorization: `Bearer ${getAdminToken()}` } }
    });
  }
  return _adminSb;
}


// ─── MOCK DATA — CATEGORIES ───────────────────
// Usado localmente nas telas que ainda buscam por conta própria.
let ADMIN_CATS = [];

// ─── CHART DATA ───────────────────────────────
const CHART_DATA = [
  { label: 'Seg', val: 78 }, { label: 'Ter', val: 95 }, { label: 'Qua', val: 120 },
  { label: 'Qui', val: 88 }, { label: 'Sex', val: 143 }, { label: 'Sáb', val: 61 }, { label: 'Dom', val: 42 }
];
const CHART_MAX = Math.max(...CHART_DATA.map(d => d.val));

// ─── TOAST SYSTEM ─────────────────────────────
function showToast(msg, type = 'success') {
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };
  let container = document.querySelector('.adm-toast-container');
  if (!container) { container = document.createElement('div'); container.className = 'adm-toast-container'; document.body.appendChild(container); }
  const toast = document.createElement('div');
  toast.className = `adm-toast adm-toast--${type}`;
  toast.innerHTML = `${icons[type]}<span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateY(10px)'; toast.style.transition='all .3s'; setTimeout(()=>toast.remove(),300); }, 3000);
}

// ─── DASHBOARD FETCH HELPERS ──────────────────
async function fetchCount(table, query = '') {
  const q = query ? (query.startsWith('?') ? query : '?' + query) : '';
  try {
    const res = await fetch(`${ADM_SB_URL}/rest/v1/${table}${q}`, {
      method: 'HEAD',
      headers: {
        'apikey': ADM_SB_ANON,
        'Authorization': `Bearer ${ADM_SB_ANON}`,
        'Prefer': 'count=exact'
      }
    });
    const range = res.headers.get('Content-Range');
    if (range) {
      return parseInt(range.split('/')[1] || '0', 10);
    }
    return 0;
  } catch (err) {
    console.warn(`[admin.js] fetchCount error on ${table}:`, err);
    return 0;
  }
}

// ─── MODAL ────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ─── CUSTOM CONFIRM ───────────────────────────
window.admConfirm = function(msg) {
  return new Promise((resolve) => {
    const html = `
    <div id="adm-confirm-modal" class="adm-overlay open" style="z-index:99999;">
      <div class="adm-modal" style="max-width:400px; text-align:center; padding:30px 20px; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <div style="color:var(--adm-accent); margin-bottom:15px; display:flex; justify-content:center;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h3 style="margin-bottom:10px; font-size:1.2rem; color:var(--adm-text);">Confirmação</h3>
        <p style="color:var(--adm-text-muted); margin-bottom:25px; line-height:1.5">${msg}</p>
        <div style="display:flex; justify-content:center; gap:10px;">
          <button id="btn-confirm-cancel" class="adm-btn adm-btn--outline" style="min-width:100px; justify-content:center;">Cancelar</button>
          <button id="btn-confirm-ok" class="adm-btn adm-btn--primary" style="min-width:100px; justify-content:center;">OK</button>
        </div>
      </div>
    </div>`;
    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div);
    
    document.getElementById('btn-confirm-cancel').onclick = () => { div.remove(); resolve(false); };
    document.getElementById('btn-confirm-ok').onclick = () => { div.remove(); resolve(true); };
  });
};

// ─── RENDER SIDEBAR + TOPBAR ──────────────────
function renderSidebar(activePage) {
  const admin = getAdmin();
  const navItems = [
    { label: 'Principal', items: [
      { href: '/admin/index.html',      icon: 'grid', label: 'Dashboard' },
    ]},
    { label: 'Conteúdo', items: [
      { href: '/admin/anuncios.html',   icon: 'list', label: 'Anúncios', badgeKey: 'pending-ads', badgeType: '' },
      { href: '/admin/leiloes.html',    icon: 'calendar', label: 'Leilões' },
      { href: '/admin/usuarios.html',   icon: 'users', label: 'Usuários' },
      { href: '/admin/denuncias.html',  icon: 'flag', label: 'Denúncias', badgeKey: 'open-reports', badgeType: 'adm-nav-badge--amber' },
      { href: '/admin/categorias.html', icon: 'tag', label: 'Categorias' },
      { href: '/admin/verificacoes.html', icon: 'shield', label: 'Verificações' },
    ]},
    { label: 'Sistema', items: [
      { href: '/admin/banners.html',      icon: 'image',    label: 'Banners' },
      { href: '/admin/planos.html',       icon: 'star',     label: 'Planos' },
      { href: '/admin/assinaturas.html',  icon: 'credit-card', label: 'Assinaturas' },
      { href: '/admin/configuracoes.html',icon: 'settings', label: 'Configurações' },
      { href: '/index.html', icon: 'eye', label: 'Ver Site Público', target: '_blank' },
    ]},
  ];

  const svgMap = {
    grid:  '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    list:  '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    flag:  '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    tag:   '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
    eye:   '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2-2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
  };

  const el = document.getElementById('adm-sidebar');
  if (!el) return;

  try {
    const sidebarHTML = `
      <div class="adm-sidebar-logo">
        <div class="adm-logo-mark">TC</div>
        <div class="adm-logo-text">
          <div class="adm-logo-name">Tauze Class</div>
          <div class="adm-logo-sub">Admin Panel</div>
        </div>
      </div>
      <nav class="adm-nav">
        ${navItems.map(section => `
          <div class="adm-nav-section">${section.label}</div>
          ${section.items.map(item => {
            const active = item.href.endsWith(activePage);
            return `<a href="${item.href}" class="adm-nav-item${active?' active':''}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgMap[item.icon]}</svg>
              <span>${item.label}</span>
              ${item.badgeKey ? `<span class="adm-nav-badge ${item.badgeType||''}" data-badge="${item.badgeKey}" style="display:none">0</span>` : ''}
            </a>`;
          }).join('')}
        `).join('')}
      </nav>
      <div class="adm-sidebar-footer">
        <div class="adm-user-pill">
          <div class="adm-user-avatar">${String(admin.name || 'A').charAt(0).toUpperCase()}</div>
          <div>
            <div class="adm-user-name">${admin.name || 'Admin'}</div>
            <div class="adm-user-role">Administrador</div>
          </div>
        </div>
        <button onclick="adminLogout()" class="adm-btn adm-btn--outline adm-btn--sm" style="width:100%;margin-top:8px;justify-content:center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sair
        </button>
      </div>`;
    el.innerHTML = sidebarHTML;
  } catch(e) {
    console.error('Error rendering sidebar:', e);
    el.innerHTML = `<div style="padding:20px;color:red;font-size:12px;">Erro menu: ${e.message}</div>`;
  }
}

// ─── AD STATUS helpers ────────────────────────
function statusBadge(status) {
  const map = { active:'Ativo', pending:'Pendente', rejected:'Rejeitado', blocked:'Bloqueado', resolved:'Resolvido', featured:'Destaque' };
  return `<span class="adm-badge adm-badge--${status}">${map[status]||status}</span>`;
}
function severityBadge(sev) {
  const map = { high:'Alta', medium:'Média', low:'Baixa' };
  return `<span class="adm-badge adm-badge--${sev}">${map[sev]||sev}</span>`;
}

// ─── APPROVE/REJECT/FEATURE STUBS ─────────────
function approveAd(id)  { showToast(`Anúncio #${id} aprovado com sucesso!`, 'success'); updateRowStatus(id, 'active'); }
function rejectAd(id)   { showToast(`Anúncio #${id} rejeitado.`, 'warning'); updateRowStatus(id, 'rejected'); }
function featureAd(id)  { showToast(`Anúncio #${id} marcado como Destaque ★`, 'info'); }
async function deleteAd(id)   { if((await admConfirm('Excluir este anúncio permanentemente?'))) { showToast(`Anúncio #${id} excluído.`, 'error'); document.getElementById(`row-ad-${id}`)?.remove(); } }
function verifyUser(id) { showToast(`Usuário #${id} verificado ✓`, 'success'); }
function blockUser(id)  { showToast(`Usuário #${id} bloqueado.`, 'warning'); }
async function deleteUser(id) { if((await admConfirm('Excluir este usuário?'))) { showToast(`Usuário #${id} excluído.`, 'error'); document.getElementById(`row-user-${id}`)?.remove(); } }
function resolveReport(id) { showToast('Denúncia marcada como resolvida.', 'success'); document.getElementById(`row-rep-${id}`)?.remove(); }
function dismissReport(id) { showToast('Denúncia descartada.', 'info'); document.getElementById(`row-rep-${id}`)?.remove(); }
function removeAdReport(adTitle) { showToast(`Anúncio "${adTitle.substring(0,30)}..." removido.`, 'error'); }

function updateRowStatus(id, status) {
  const badge = document.querySelector(`#row-ad-${id} .adm-badge`);
  if (badge) { badge.className = `adm-badge adm-badge--${status}`; badge.textContent = { active:'Ativo', rejected:'Rejeitado' }[status]||status; }
}

// ─── LIVE SEARCH ──────────────────────────────
function filterTable(inputId, tableId) {
  const q = document.getElementById(inputId)?.value.toLowerCase() || '';
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ─── ANIMATED COUNTER ─────────────────────────
function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseInt(el.getAttribute('data-count'));
    const suffix = el.getAttribute('data-suffix') || '';
    const duration = 1200;
    const step = target / (duration / 16);
    let current = 0;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = (current >= 1000 ? (current/1000).toFixed(1)+'k' : Math.round(current)) + suffix;
      if (current >= target) clearInterval(timer);
    }, 16);
  });
}

// ─── RENDER CHART ─────────────────────────────
function renderChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const chartData = data || CHART_DATA;
  const maxVal = Math.max(...chartData.map(d => d.val), 1);
  container.innerHTML = chartData.map(d => {
    const h = Math.round((d.val / maxVal) * 100);
    return `
      <div class="adm-chart-bar-wrap">
        <div class="adm-chart-bar" style="height:${h}%" data-val="${d.val}"></div>
        <span class="adm-chart-lbl">${d.label}</span>
      </div>`;
  }).join('');
}

// ─── INIT COMMON ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  animateCounters();
  applyAdminDynamicSettings();
});

// ─── DYNAMIC CONFIGURATIONS ────────────────
function applyAdminDynamicSettings() {
  const logoUrl = localStorage.getItem('tc_logo_url');
  const primaryColor = localStorage.getItem('tc_primary_color');

  // Apply Logo
  if (logoUrl) {
    document.querySelectorAll('.adm-logo-mark').forEach(el => {
      el.textContent = '';
      el.style.backgroundImage = `url('${logoUrl}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundColor = 'transparent';
    });
  }

  // Apply Primary Color
  if (primaryColor) {
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --clr-primary: ${primaryColor} !important;
        --clr-primary-mid: ${primaryColor} !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── SUPABASE ADMIN DATA LAYER ────────────────
// Loads real stats from the DB and updates KPI cards on the dashboard.
// Falls back to mock data if Supabase is unavailable.

async function fetchAdminStats() {
  try {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase não inicializado');

    // ── 1 RPC call substitui a view admin_stats (que fazia 9 subqueries) ──
    const { data, error } = await sb.rpc('get_admin_stats');
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.warn('[Admin] Erro no RPC get_admin_stats:', e);
    return null;
  }
}

async function fetchAdminAds({ limit = 50, status } = {}) {
  let url = `${ADM_SB_URL}/rest/v1/ads?select=id,title_pt,category_id,price,currency,status,featured,views_count,created_at,country,profiles(name)&order=created_at.desc&limit=${limit}`;
  if (status) url += `&status=eq.${status}`;
  try {
    const res = await fetch(url, {
      headers: { 'apikey': ADM_SB_ANON, 'Authorization': `Bearer ${getAdminToken()}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchAdminUsers({ limit = 50 } = {}) {
  const url = `${ADM_SB_URL}/rest/v1/profiles?select=id,name,country,plan,ads_count,verified,created_at&order=created_at.desc&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { 'apikey': ADM_SB_ANON, 'Authorization': `Bearer ${getAdminToken()}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchAdminReports({ limit = 50 } = {}) {
  const url = `${ADM_SB_URL}/rest/v1/reports?select=id,reason,severity,status,created_at,ads(title_pt),reporter:profiles!reports_reporter_id_fkey(name)&order=created_at.desc&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { 'apikey': ADM_SB_ANON, 'Authorization': `Bearer ${getAdminToken()}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function updateAdStatus(adId, newStatus, reason = null) {
  const res = await fetch(`${ADM_SB_URL}/rest/v1/ads?id=eq.${adId}`, {
    method: 'PATCH',
    headers: {
      'apikey': ADM_SB_ANON,
      'Authorization': `Bearer ${getAdminToken()}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ status: newStatus })
  });

  if (res.ok) {
    // Dispara notificação por email via Edge Function (fire-and-forget)
    const notifyStatuses = ['active', 'rejected', 'expired'];
    if (notifyStatuses.includes(newStatus)) {
      fetch(`${ADM_SB_URL}/functions/v1/notify-ad-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({ ad_id: adId, new_status: newStatus, reason }),
      }).catch(e => console.warn('[notify] Edge Function erro:', e));
    }
  }

  return res.ok;
}

// ─── SALDO INICIAL (Offsets) ──────────────────────────────────────────────────
// Returns the configured initial balance offsets from localStorage.
// Used by both the admin dashboard and the public homepage.
window.getSaldoInicial = function() {
  return {
    ads:     parseInt(localStorage.getItem('tc_cnt_ads'))     || 0,
    users:   parseInt(localStorage.getItem('tc_cnt_users'))   || 0,
    paises:  parseInt(localStorage.getItem('tc_cnt_paises'))  || 0,
    cidades: parseInt(localStorage.getItem('tc_cnt_cidades')) || 0,
    format:  localStorage.getItem('tc_cnt_format')            || 'k',
    plus:    localStorage.getItem('tc_cnt_plus') !== '0',
  };
};

window.formatContador = function(n, fmt, plus) {
  const s = plus ? '+' : '';
  if (fmt === 'k') {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k' + s;
    return n.toLocaleString('pt-BR') + s;
  } else if (fmt === 'mil') {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'mil' + s;
    return n.toLocaleString('pt-BR') + s;
  }
  return n.toLocaleString('pt-BR') + s;
};

// Auto-load real stats
document.addEventListener('DOMContentLoaded', async () => {
  const isDashboard = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/admin/');

  const stats = await fetchAdminStats();
  const offsets = getSaldoInicial();

  // Helper to add offset label
  function withOffset(val, offset) {
    if (!offset || offset === 0) return val;
    return `${val} (+${offset.toLocaleString('pt-BR')} offset)`;
  }

  if (stats) {
    if (isDashboard) {
      const kpiMap = {
        'kpi-users':         withOffset((stats.total_users || 0) + offsets.users,   offsets.users),
        'kpi-ads':           withOffset((stats.active_ads  || 0) + offsets.ads,     offsets.ads),
        'kpi-pending':       stats.pending_ads,
        'kpi-revenue':       `R$ ${Number(stats.mrr || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}`,
        'kpi-subscribers':   stats.paying_subscribers,
        'kpi-reports':       stats.open_reports,
        'kpi-live-auctions': stats.live_auctions,
        'kpi-messages':      stats.messages_today,
        'kpi-new-users':     stats.new_users_week,
      };

      Object.entries(kpiMap).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.textContent = val;
      });
    }

    // Update sidebar badge for pending ads
    document.querySelectorAll('[data-badge="pending-ads"]').forEach(el => {
      el.textContent = stats.pending_ads;
      el.style.display = stats.pending_ads > 0 ? '' : 'none';
    });

    // Update sidebar badge for open reports
    document.querySelectorAll('[data-badge="open-reports"]').forEach(el => {
      el.textContent = stats.open_reports;
      el.style.display = stats.open_reports > 0 ? '' : 'none';
    });
  }

  // Show offset badge on dashboard stat cards if any offset is set
  if (isDashboard) {
    const totalOffset = offsets.ads + offsets.users + offsets.paises + offsets.cidades;
    if (totalOffset > 0) {
      const badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;bottom:20px;right:20px;background:rgba(22,163,74,.15);border:1px solid rgba(22,163,74,.3);border-radius:8px;padding:8px 14px;font-size:.78rem;color:#4ADE80;display:flex;align-items:center;gap:6px;z-index:50';
      badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Saldo inicial ativo — <a href="/admin/configuracoes.html" style="color:#4ADE80;text-decoration:underline">editar</a>`;
      document.body.appendChild(badge);
      setTimeout(() => badge.style.opacity = '0', 5000);
      setTimeout(() => badge.remove(), 5500);
    }
  }
});
