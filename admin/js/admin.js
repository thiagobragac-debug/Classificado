/* ─── ADMIN JS ───────────────────────────────
   Tauze Class Admin Panel
   Mock data + logic for all admin pages
   ──────────────────────────────────────────── */

// ─── AUTH ─────────────────────────────────────
const ADMIN_USER = { email: 'admin@tauzeclass.com', password: 'admin123', name: 'Admin TC', role: 'Administrador' };

function checkAuth() {
  if (!sessionStorage.getItem('tc_admin')) {
    window.location.href = '/admin/login.html';
  }
}
function adminLogin(email, password) {
  if (email === ADMIN_USER.email && password === ADMIN_USER.password) {
    sessionStorage.setItem('tc_admin', JSON.stringify({ name: ADMIN_USER.name, email }));
    return true;
  }
  return false;
}
function adminLogout() {
  sessionStorage.removeItem('tc_admin');
  window.location.href = '/admin/login.html';
}
function getAdmin() {
  return JSON.parse(sessionStorage.getItem('tc_admin') || '{}');
}

// ─── MOCK DATA — ADS ──────────────────────────
const ADMIN_ADS = [
  { id: 1,  title: 'Lote 50 Novilhas Nelore PO — Alta Genética', category: 'Bovinos', seller: 'Fazenda Boa Esperança', price: 'R$ 160.000', status: 'active',   featured: true,  country: 'Brasil',    date: '02/07/2026', image: 'https://images.unsplash.com/photo-1570042225831-d98fa7577f1e?w=60&q=70', reports: 0 },
  { id: 2,  title: 'Égua Quarto de Milha — 4 anos', category: 'Equinos', seller: 'Haras São João', price: 'R$ 28.000', status: 'pending',  featured: false, country: 'Brasil',    date: '02/07/2026', image: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=60&q=70', reports: 0 },
  { id: 3,  title: 'Trator New Holland TL 75E 4x4', category: 'Máquinas', seller: 'Agro Máquinas MT', price: 'R$ 95.000', status: 'active',   featured: true,  country: 'Brasil',    date: '01/07/2026', image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=60&q=70', reports: 1 },
  { id: 4,  title: 'Fazenda 340 ha — Soja/Milho Pronta', category: 'Imóveis', seller: 'Imobiliária Agro', price: 'R$ 12.500.000', status: 'active',   featured: true,  country: 'Brasil',    date: '01/07/2026', image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=60&q=70', reports: 0 },
  { id: 5,  title: 'Sementes de Soja RR Safra 25/26', category: 'Insumos', seller: 'AgroSementes PR', price: 'R$ 290', status: 'pending',  featured: false, country: 'Brasil',    date: '02/07/2026', image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=60&q=70', reports: 0 },
  { id: 6,  title: 'Touros Angus Black — DEPs Top 1%', category: 'Genética', seller: 'Genética Premium', price: 'R$ 18.000', status: 'rejected', featured: false, country: 'Brasil',    date: '30/06/2026', image: 'https://images.unsplash.com/photo-1570042225831-d98fa7577f1e?w=60&q=70', reports: 2 },
  { id: 7,  title: '200 Terneros Aberdeen Angus', category: 'Bovinos', seller: 'El Gaucho SA', price: 'ARS 180.000', status: 'active',   featured: false, country: 'Argentina', date: '02/07/2026', image: 'https://images.unsplash.com/photo-1527153818091-1a9638521e2a?w=60&q=70', reports: 0 },
  { id: 8,  title: 'Cosechadora John Deere S760', category: 'Máquinas', seller: 'Máquinas del Sur', price: 'ARS 12.000.000', status: 'pending',  featured: false, country: 'Argentina', date: '01/07/2026', image: 'https://images.unsplash.com/photo-1598894850947-8b1de3d4e84f?w=60&q=70', reports: 0 },
  { id: 9,  title: '50 Leitões Landrace — Raça Pura', category: 'Suínos', seller: 'Granjas São Paulo', price: 'R$ 1.200', status: 'active',   featured: false, country: 'Brasil',    date: '02/07/2026', image: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=60&q=70', reports: 0 },
  { id: 10, title: 'Estância 500 hectares — Campo Nativo', category: 'Imóveis', seller: 'Estâncias do Sul', price: 'R$ 8.500.000', status: 'active',   featured: false, country: 'Uruguai',   date: '30/06/2026', image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=60&q=70', reports: 0 },
  { id: 11, title: 'Lote 30 Ovelhas Santa Inês Prenhes', category: 'Ovinos', seller: 'Ovinocultura NE', price: 'R$ 1.800', status: 'pending',  featured: false, country: 'Brasil',    date: '02/07/2026', image: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=60&q=70', reports: 0 },
  { id: 12, title: 'Tanques de Piscicultura — Tilápia', category: 'Aquicultura', seller: 'Pesca Amazônia', price: 'R$ 45.000', status: 'active',   featured: false, country: 'Brasil',    date: '01/07/2026', image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=60&q=70', reports: 0 },
];

// ─── MOCK DATA — USERS ────────────────────────
const ADMIN_USERS = [
  { id: 1,  name: 'Fazenda Boa Esperança', email: 'contato@fazendaboe.com.br', country: '🇧🇷 Brasil',    plan: 'Premium', ads: 47, status: 'active',  verified: true,  joined: '12/01/2025' },
  { id: 2,  name: 'Haras São João',        email: 'haras@saojoao.com',          country: '🇧🇷 Brasil',    plan: 'Grátis',  ads: 8,  status: 'active',  verified: true,  joined: '03/03/2025' },
  { id: 3,  name: 'El Gaucho SA',          email: 'ventas@elgaucho.com.ar',     country: '🇦🇷 Argentina', plan: 'Premium', ads: 23, status: 'active',  verified: true,  joined: '18/11/2024' },
  { id: 4,  name: 'AgroMáquinas MT',       email: 'agro@maquinas.mt.br',        country: '🇧🇷 Brasil',    plan: 'Pro',     ads: 15, status: 'active',  verified: false, joined: '22/05/2025' },
  { id: 5,  name: 'Imobiliária Agro',      email: 'imoveis@agroland.com',       country: '🇧🇷 Brasil',    plan: 'Pro',     ads: 31, status: 'active',  verified: true,  joined: '08/02/2025' },
  { id: 6,  name: 'João da Silva',         email: 'joao@email.com',             country: '🇧🇷 Brasil',    plan: 'Grátis',  ads: 3,  status: 'blocked', verified: false, joined: '01/07/2026' },
  { id: 7,  name: 'Máquinas del Sur',      email: 'info@maquinasdelsur.ar',     country: '🇦🇷 Argentina', plan: 'Premium', ads: 19, status: 'active',  verified: true,  joined: '30/09/2024' },
  { id: 8,  name: 'Estâncias do Sul',      email: 'campo@estanciasdosul.uy',    country: '🇺🇾 Uruguai',   plan: 'Pro',     ads: 12, status: 'active',  verified: true,  joined: '15/04/2025' },
  { id: 9,  name: 'Granjas São Paulo',     email: 'granjas@spagro.com.br',      country: '🇧🇷 Brasil',    plan: 'Grátis',  ads: 6,  status: 'pending', verified: false, joined: '02/07/2026' },
  { id: 10, name: 'AgroSementes PR',       email: 'sementes@agropr.com.br',     country: '🇧🇷 Brasil',    plan: 'Pro',     ads: 28, status: 'active',  verified: true,  joined: '11/12/2024' },
];

// ─── MOCK DATA — REPORTS ──────────────────────
const ADMIN_REPORTS = [
  { id: 1, ad: 'Touros Angus Black — DEPs Top 1%',     reporter: 'João da Silva',  reason: 'Informações enganosas / Preço incorreto', severity: 'high',   status: 'pending',  date: '01/07/2026' },
  { id: 2, ad: 'Trator New Holland TL 75E 4x4',        reporter: 'Maria Oliveira', reason: 'Anúncio duplicado', severity: 'low',    status: 'pending',  date: '02/07/2026' },
  { id: 3, ad: 'Touros Angus Black — DEPs Top 1%',     reporter: 'Carlos Souza',   reason: 'Fraude / Golpe', severity: 'high',   status: 'pending',  date: '02/07/2026' },
  { id: 4, ad: 'Égua Quarto de Milha — 4 anos',        reporter: 'Ana Lima',       reason: 'Contato suspeito', severity: 'medium', status: 'resolved', date: '30/06/2026' },
  { id: 5, ad: 'Fazenda 340 ha — Soja/Milho Pronta',   reporter: 'Pedro Santos',   reason: 'Preço muito acima do mercado', severity: 'low',    status: 'pending',  date: '02/07/2026' },
];

// ─── MOCK DATA — CATEGORIES ───────────────────
const ADMIN_CATS = [
  { id: 'bovinos',  name: 'Bovinos',     icon: '🐄', color: '#D97706', bg: '#FFFBEB', ads: 12847, active: true },
  { id: 'equinos',  name: 'Equinos',     icon: '🐎', color: '#B45309', bg: '#FEF3C7', ads: 4231,  active: true },
  { id: 'suinos',   name: 'Suínos',      icon: '🐷', color: '#EA580C', bg: '#FFF7ED', ads: 1892,  active: true },
  { id: 'ovinos',   name: 'Ovinos',      icon: '🐑', color: '#16A34A', bg: '#F0FDF4', ads: 2109,  active: true },
  { id: 'aves',     name: 'Aves',        icon: '🐔', color: '#2563EB', bg: '#EFF6FF', ads: 3445,  active: true },
  { id: 'insumos',  name: 'Insumos',     icon: '🌱', color: '#15803D', bg: '#F0FDF4', ads: 8712,  active: true },
  { id: 'maquinas', name: 'Máquinas',    icon: '🚜', color: '#1D4ED8', bg: '#EFF6FF', ads: 11223, active: true },
  { id: 'imoveis',  name: 'Imóveis',     icon: '🏡', color: '#7C3AED', bg: '#F5F3FF', ads: 5668,  active: true },
  { id: 'genetica', name: 'Genética',    icon: '🧬', color: '#DB2777', bg: '#FDF2F8', ads: 3201,  active: true },
  { id: 'aquicult', name: 'Aquicultura', icon: '🐟', color: '#0891B2', bg: '#ECFEFF', ads: 987,   active: false },
  { id: 'servicos', name: 'Serviços',    icon: '🔧', color: '#C2410C', bg: '#FFF7ED', ads: 4432,  active: true },
  { id: 'outros',   name: 'Outros',      icon: '📦', color: '#475569', bg: '#F8FAFC', ads: 4100,  active: true },
];

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

// ─── MODAL ────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ─── RENDER SIDEBAR + TOPBAR ──────────────────
function renderSidebar(activePage) {
  const admin = getAdmin();
  const navItems = [
    { label: 'Principal', items: [
      { href: '/admin/index.html',      icon: 'grid', label: 'Dashboard' },
    ]},
    { label: 'Conteúdo', items: [
      { href: '/admin/anuncios.html',   icon: 'list', label: 'Anúncios', badge: ADMIN_ADS.filter(a=>a.status==='pending').length, badgeType: '' },
      { href: '/admin/leiloes.html',    icon: 'calendar', label: 'Leilões' },
      { href: '/admin/usuarios.html',   icon: 'users', label: 'Usuários' },
      { href: '/admin/denuncias.html',  icon: 'flag', label: 'Denúncias', badge: ADMIN_REPORTS.filter(r=>r.status==='pending').length, badgeType: 'adm-nav-badge--amber' },
      { href: '/admin/categorias.html', icon: 'tag', label: 'Categorias' },
    ]},
    { label: 'Sistema', items: [
      { href: '/admin/banners.html',      icon: 'image',    label: 'Banners' },
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
  };

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
            ${item.badge ? `<span class="adm-nav-badge ${item.badgeType||''}">${item.badge}</span>` : ''}
          </a>`;
        }).join('')}
      `).join('')}
    </nav>
    <div class="adm-sidebar-footer">
      <div class="adm-user-pill">
        <div class="adm-user-avatar">${(admin.name||'A').charAt(0)}</div>
        <div>
          <div class="adm-user-name">${admin.name||'Admin'}</div>
          <div class="adm-user-role">Administrador</div>
        </div>
      </div>
      <button onclick="adminLogout()" class="adm-btn adm-btn--outline adm-btn--sm" style="width:100%;margin-top:8px;justify-content:center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sair
      </button>
    </div>`;
  const el = document.getElementById('adm-sidebar');
  if (el) el.innerHTML = sidebarHTML;
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
function deleteAd(id)   { if(confirm('Excluir este anúncio permanentemente?')) { showToast(`Anúncio #${id} excluído.`, 'error'); document.getElementById(`row-ad-${id}`)?.remove(); } }
function verifyUser(id) { showToast(`Usuário #${id} verificado ✓`, 'success'); }
function blockUser(id)  { showToast(`Usuário #${id} bloqueado.`, 'warning'); }
function deleteUser(id) { if(confirm('Excluir este usuário?')) { showToast(`Usuário #${id} excluído.`, 'error'); document.getElementById(`row-user-${id}`)?.remove(); } }
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
function renderChart(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = CHART_DATA.map(d => {
    const h = Math.round((d.val / CHART_MAX) * 100);
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
        --clr-primary-dark: ${primaryColor} !important;
      }
    `;
    document.head.appendChild(style);
  }
}
