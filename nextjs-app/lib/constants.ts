// ============================================
//   TAUZE CLASS — Constantes e Traduções
//   Dados migrados de data.js e ui_constants.js
// ============================================

// ─── I18N ───────────────────────────────────────────────────────

export const I18N = {
  pt: {
    nav_home: 'Início', nav_ads: 'Anúncios', nav_events: 'Eventos',
    nav_categories: 'Categorias', nav_auctions: 'Leilões Ao Vivo',
    nav_plans: 'Planos', nav_about: 'Sobre', nav_login: 'Entrar',
    btn_post: 'Anunciar Grátis',
    hero_badge: 'Mercosul · Brasil · Argentina · Paraguai · Uruguai',
    hero_title: 'O maior classificado do', hero_highlight: 'Agronegócio',
    hero_title2: 'do Mercosul',
    hero_sub: 'Compre, venda e anuncie animais, máquinas e imóveis rurais no Mercosul.',
    search_placeholder: 'Buscar animais, insumos, máquinas...',
    search_btn: 'Buscar', popular: 'Popular:',
    btn_post_hero: 'Anunciar Grátis', btn_explore: 'Explorar Anúncios',
    stats_0: 'Ativos', stats_1: 'Cidades', stats_2: 'Países', stats_3: 'Verificados',
    section_cats: 'Categorias', section_cats_title: 'O que você está procurando?',
    section_featured: 'Em Destaque', section_featured_title: 'Anúncios em Destaque',
    section_recent: 'Recentes', section_recent_title: 'Últimos Anúncios',
    view_all: 'Ver todos', trust_title: 'Por que usar o Tauze Class?',
    trust_label: 'Por que escolher o Tauze Class',
    trust_subtitle: 'A plataforma mais confiável para negócios rurais no Mercosul.',
    mercosul_label: 'Cobertura Mercosul',
    mercosul_title: 'Conectamos o Agronegócio de 4 países',
    mercosul_sub: 'Maior portal de classificados rurais do Mercosul. Vendedores e compradores em todo o Brasil, Argentina, Paraguai e Uruguai.',
    cta_title: 'Seu anúncio para milhares de compradores',
    cta_sub: 'Cadastre-se gratuitamente e publique seu anúncio em minutos. Alcance compradores em todo o Mercosul.',
    btn_free: 'Criar Conta Grátis', btn_know: 'Saiba mais',
    footer_desc: 'O maior portal de classificados do agronegócio do Mercosul.',
    footer_ads: 'Anúncios', footer_help: 'Ajuda', footer_company: 'Empresa',
    footer_copy: '© 2026 Tauze Class. Todos os direitos reservados.',
    negociable: 'Negociável', verified: 'Verificado', see_ad: 'Ver Anúncio',
    fc_bovinos: 'Bovinos', fc_ads_available: 'anúncios disponíveis',
    fc_verified: 'Verificado ✓', fc_sellers: 'vendedores',
    fc_auctions: 'Leilões', fc_scheduled: 'agendados esta semana',
    fc_machines: 'Máquinas', fc_machines_sub: 'prontas para trabalho',
    filter_featured: 'Destaque', filter_cat: 'Categoria',
    recently_viewed: 'Vistos Recentemente',
    top_sellers_label: 'Lojas de Destaque', top_sellers: 'Top Vendedores',
    top_sellers_empty: 'Nenhum vendedor em destaque ainda.',
    testimonials_label: 'Provas Sociais', testimonials: 'Casos de Sucesso',

    // Auth & Forms
    auth_email: 'E-mail', auth_email_ph: 'seu@email.com',
    auth_pass: 'Senha', auth_pass_ph: '••••••••',
    auth_forgot: 'Esqueceu a senha?',
    auth_login_btn: 'Entrar na Conta', auth_login_ing: 'Entrando...',
    auth_google: 'Continuar com Google', auth_or_email: 'ou continue com e-mail',
    auth_register_btn: 'Criar Conta', auth_register_ing: 'Criando conta...',
    auth_name: 'Nome Completo', auth_name_ph: 'João da Silva',
    auth_display: 'Nome de Exibição / Fazenda', auth_display_ph: 'Ex: Fazenda São João',
    auth_doc: 'CPF / CNPJ', auth_doc_ph: '000.000.000-00 ou 00.000.000/0001-00',
    auth_phone: 'WhatsApp / Telefone', auth_phone_ph: '+55 (99) 9 9999-9999',
    auth_cep: 'CEP', auth_cep_ph: '00000-000',
    auth_forgot_title: 'Recuperar Senha',
    auth_forgot_desc: 'Digite o e-mail associado à sua conta e enviaremos um link para redefinir sua senha.',
    auth_forgot_btn: 'Enviar link de recuperação', auth_forgot_ing: 'Enviando...',
    auth_back_login: 'Voltar para o login',
    
    // Zod Validation (PT)
    err_email: 'Digite um e-mail válido.',
    err_pass_req: 'A senha é obrigatória.',
    err_pass_min: 'A senha deve ter pelo menos 8 caracteres.',
    err_name: 'O nome deve ter no mínimo 3 caracteres.',
    err_display: 'O nome de exibição é obrigatório.',
    err_doc: 'Documento inválido.',
    err_phone: 'Telefone inválido.',
    err_cep: 'CEP inválido.',

    // Eventos (achado do teste completo do site, 2026-08-24: página inteira
    // ficava fixa em português mesmo com ES selecionado)
    events_title: 'Agenda de Eventos',
    events_subtitle: 'Descubra as maiores feiras, exposições e congressos do Agronegócio.',
    events_highlights: 'Grandes Destaques Nacionais',
    events_card_fallback_desc: 'Confira os detalhes deste grande evento do Agronegócio.',
    events_featured_badge: 'Destaque Oficial',
    events_live: 'Ao Vivo',
    events_no_location: 'Local a definir',
    events_empty: 'Nenhum evento encontrado',
    events_empty_for: 'para',
    events_clear_search: 'Limpar busca e ver todos',
    events_search_placeholder: 'Digite sua cidade...',
    events_locating: 'Localizando...',
    events_search_btn: 'Buscar',
    events_use_gps: 'Usar GPS',
    events_location_success: 'Localização detectada com sucesso!',
    events_location_error: 'Não foi possível detectar a localização (GPS negado ou IP falhou).',
    err_invalid_credentials: 'E-mail ou senha incorretos.',

    // Paginação (compartilhada entre listagem, painel etc.)
    pagination_prev: 'Anterior',
    pagination_next: 'Próxima',
    pagination_page: 'Página',
  },
  es: {
    nav_home: 'Inicio', nav_ads: 'Anuncios', nav_events: 'Eventos',
    nav_categories: 'Categorías', nav_auctions: 'Remates en Vivo',
    nav_plans: 'Planes', nav_about: 'Nosotros', nav_login: 'Ingresar',
    btn_post: 'Anunciar Gratis',
    hero_badge: 'Mercosur · Brasil · Argentina · Paraguay · Uruguay',
    hero_title: 'El clasificado más grande del', hero_highlight: 'Agronegocio',
    hero_title2: 'del Mercosur',
    hero_sub: 'Compra, vende y publica animales, insumos, maquinaria y propiedades rurales con seguridad y facilidad.',
    search_placeholder: 'Buscar animales, insumos, máquinas...',
    search_btn: 'Buscar', popular: 'Popular:',
    btn_post_hero: 'Anunciar Gratis', btn_explore: 'Explorar Anuncios',
    stats_0: 'Activos', stats_1: 'Ciudades', stats_2: 'Países', stats_3: 'Verificados',
    section_cats: 'Categorías', section_cats_title: '¿Qué estás buscando?',
    section_featured: 'Destacados', section_featured_title: 'Anuncios Destacados',
    section_recent: 'Recientes', section_recent_title: 'Últimos Anuncios',
    view_all: 'Ver todos', trust_title: '¿Por qué usar Tauze Class?',
    trust_label: 'Por qué elegir Tauze Class',
    trust_subtitle: 'La plataforma más confiable para negocios rurales en el Mercosur.',
    mercosul_label: 'Cobertura Mercosur',
    mercosul_title: 'Conectamos el Agronegocio de 4 países',
    mercosul_sub: 'Mayor portal de clasificados rurales del Mercosur. Vendedores y compradores en todo Brasil, Argentina, Paraguay y Uruguay.',
    cta_title: 'Tu anuncio para miles de compradores',
    cta_sub: 'Regístrate gratis y publica tu anuncio en minutos. Alcanza compradores en todo el Mercosur.',
    btn_free: 'Crear Cuenta Gratis', btn_know: 'Saber más',
    footer_desc: 'El mayor portal de clasificados del agronegocio del Mercosur.',
    footer_ads: 'Anuncios', footer_help: 'Ayuda', footer_company: 'Empresa',
    footer_copy: '© 2026 Tauze Class. Todos los derechos reservados.',
    negociable: 'Negociable', verified: 'Verificado', see_ad: 'Ver Anuncio',
    fc_bovinos: 'Bovinos', fc_ads_available: 'anuncios disponibles',
    fc_verified: 'Verificado ✓', fc_sellers: 'vendedores',
    fc_auctions: 'Remates', fc_scheduled: 'programados esta semana',
    fc_machines: 'Maquinaria', fc_machines_sub: 'lista para trabajar',
    filter_featured: 'Destacado', filter_cat: 'Categoría',
    recently_viewed: 'Vistos Recientemente',
    top_sellers_label: 'Tiendas Destacadas', top_sellers: 'Top Vendedores',
    top_sellers_empty: 'Ningún vendedor destacado todavía.',
    testimonials_label: 'Pruebas Sociales', testimonials: 'Casos de Éxito',

    // Auth & Forms
    auth_email: 'Correo Electrónico', auth_email_ph: 'tu@email.com',
    auth_pass: 'Contraseña', auth_pass_ph: '••••••••',
    auth_forgot: '¿Olvidaste tu contraseña?',
    auth_login_btn: 'Iniciar Sesión', auth_login_ing: 'Iniciando...',
    auth_google: 'Continuar con Google', auth_or_email: 'o continuar con correo',
    auth_register_btn: 'Crear Cuenta', auth_register_ing: 'Creando cuenta...',
    auth_name: 'Nombre Completo', auth_name_ph: 'Juan Pérez',
    auth_display: 'Nombre Público / Estancia', auth_display_ph: 'Ej: Estancia San Juan',
    auth_doc: 'Documento de Identidad', auth_doc_ph: 'Número de documento',
    auth_phone: 'WhatsApp / Teléfono', auth_phone_ph: '+00 (00) 0000-0000',
    auth_cep: 'Código Postal', auth_cep_ph: '0000',
    auth_forgot_title: 'Recuperar Contraseña',
    auth_forgot_desc: 'Ingresa el correo asociado a tu cuenta y te enviaremos un enlace para restablecer tu contraseña.',
    auth_forgot_btn: 'Enviar enlace de recuperación', auth_forgot_ing: 'Enviando...',
    auth_back_login: 'Volver al inicio de sesión',
    
    // Zod Validation (ES)
    err_email: 'Ingresa un correo electrónico válido.',
    err_pass_req: 'La contraseña es obligatoria.',
    err_pass_min: 'La contraseña debe tener al menos 8 caracteres.',
    err_name: 'El nombre debe tener al menos 3 caracteres.',
    err_display: 'El nombre público es obligatorio.',
    err_doc: 'Documento inválido.',
    err_phone: 'Teléfono inválido.',
    err_cep: 'Código postal inválido.',

    // Eventos
    events_title: 'Agenda de Eventos',
    events_subtitle: 'Descubre las mayores ferias, exposiciones y congresos del Agronegocio.',
    events_highlights: 'Grandes Destacados Nacionales',
    events_card_fallback_desc: 'Conoce los detalles de este gran evento del Agronegocio.',
    events_featured_badge: 'Destacado Oficial',
    events_live: 'En Vivo',
    events_no_location: 'Local a definir',
    events_empty: 'Ningún evento encontrado',
    events_empty_for: 'para',
    events_clear_search: 'Limpiar búsqueda y ver todos',
    events_search_placeholder: 'Ingresa tu ciudad...',
    events_locating: 'Localizando...',
    events_search_btn: 'Buscar',
    events_use_gps: 'Usar GPS',
    events_location_success: '¡Ubicación detectada con éxito!',
    events_location_error: 'No fue posible detectar la ubicación (GPS denegado o IP falló).',
    err_invalid_credentials: 'Correo o contraseña incorrectos.',

    // Paginación (compartida entre listado, panel, etc.)
    pagination_prev: 'Anterior',
    pagination_next: 'Siguiente',
    pagination_page: 'Página',
  }
};

export type Lang = 'pt' | 'es';
export function t(key: string, lang: Lang = 'pt'): string {
  return (I18N[lang] as Record<string, string>)[key] ?? key;
}

// ─── CATEGORIES ─────────────────────────────────────────────────

export const CATEGORIES = [
  { id: 'bovinos',  icon: 'cow',     name_pt: 'Bovinos',     name_es: 'Bovinos',    count: 12847 },
  { id: 'equinos',  icon: 'horse',   name_pt: 'Equinos',     name_es: 'Equinos',    count: 4320  },
  { id: 'suinos',   icon: 'pig',     name_pt: 'Suínos',      name_es: 'Porcinos',   count: 2104  },
  { id: 'ovinos',   icon: 'sheep',   name_pt: 'Ovinos',      name_es: 'Ovinos',     count: 1876  },
  { id: 'aves',     icon: 'bird',    name_pt: 'Aves',        name_es: 'Aves',       count: 3210  },
  { id: 'insumos',  icon: 'leaf',    name_pt: 'Insumos',     name_es: 'Insumos',    count: 6543  },
  { id: 'maquinas', icon: 'tractor', name_pt: 'Máquinas',    name_es: 'Maquinaria', count: 5891  },
  { id: 'imoveis',  icon: 'house',   name_pt: 'Imóveis',     name_es: 'Inmuebles',  count: 2234  },
  { id: 'genetica', icon: 'dna',     name_pt: 'Genética',    name_es: 'Genética',   count: 987   },
  { id: 'aquicult', icon: 'fish',    name_pt: 'Aquicultura', name_es: 'Acuicultura',count: 654   },
  { id: 'servicos', icon: 'wrench',  name_pt: 'Serviços',    name_es: 'Servicios',  count: 1432  },
  { id: 'outros',   icon: 'more',    name_pt: 'Outros',      name_es: 'Otros',      count: 3210  },
];

// ─── CAT COLORS ─────────────────────────────────────────────────

export const CAT_COLORS: Record<string, { bg: string; clr: string }> = {
  bovinos:  { bg: '#FFFBEB', clr: '#D97706' },
  equinos:  { bg: '#FEF3C7', clr: '#B45309' },
  suinos:   { bg: '#FFF7ED', clr: '#EA580C' },
  ovinos:   { bg: '#F0FDF4', clr: '#16A34A' },
  aves:     { bg: '#EFF6FF', clr: '#2563EB' },
  insumos:  { bg: '#F0FDF4', clr: '#15803D' },
  maquinas: { bg: '#EFF6FF', clr: '#1D4ED8' },
  imoveis:  { bg: '#F5F3FF', clr: '#7C3AED' },
  genetica: { bg: '#FDF2F8', clr: '#DB2777' },
  aquicult: { bg: '#ECFEFF', clr: '#0891B2' },
  servicos: { bg: '#FFF7ED', clr: '#C2410C' },
  outros:   { bg: '#F8FAFC', clr: '#475569' },
};

// ─── SVG ICONS ──────────────────────────────────────────────────

export const CAT_SVG_PATHS: Record<string, string> = {
  cow:     '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/>',
  horse:   '<path d="M20 8c0-3.31-2.69-6-6-6-1.5 0-2.87.55-3.9 1.46C9.1 4.18 8 5 6 5c-1.5 0-2.78.74-3.55 1.88L2 8c0 2.21 1.79 4 4 4v8h4v-4h4v4h4v-8c2.21 0 4-1.79 4-4z"/>',
  pig:     '<circle cx="12" cy="12" r="6"/><path d="M12 6v.01M12 18v.01M18 12h.01M6 12h.01"/><circle cx="12" cy="12" r="2"/>',
  sheep:   '<circle cx="9" cy="9" r="4"/><circle cx="15" cy="9" r="4"/><path d="M5 17h14l-1-4H6l-1 4z"/><line x1="9" y1="21" x2="9" y2="17"/><line x1="15" y1="21" x2="15" y2="17"/>',
  bird:    '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  leaf:    '<path d="M17 8C8 10 5.9 16.17 3.82 19.34L2 22"/><path d="M17 8C8 10 5 19 2 22c7-2 14-4 19-11 0 0 2-10-4-3z"/>',
  tractor: '<circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="2"/><path d="M5 17H3V5h11l4 6h2v6h-2"/><path d="M9 17h4"/>',
  house:   '<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/>',
  dna:     '<path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="M2 9c6.667-6 13.333 0 20-6"/>',
  fish:    '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/>',
  wrench:  '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  more:    '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
};

// ─── POPULAR TAGS ────────────────────────────────────────────────

export const POPULAR_TAGS: Record<string, string[]> = {
  pt: ['Nelore', 'Angus', 'Trator New Holland', 'Soja Semente', 'Fazenda MT', 'Cavalo QM'],
  es: ['Nelore', 'Angus', 'Tractor New Holland', 'Semilla Soja', 'Estancia MT', 'Caballo QM'],
};

// ─── FOOTER LINKS ────────────────────────────────────────────────

export const FOOTER_LINKS = {
  pt: {
    ads: [
      { label: 'Animais',  href: '/listagem?cat=bovinos'  },
      { label: 'Insumos',  href: '/listagem?cat=insumos'  },
      { label: 'Máquinas', href: '/listagem?cat=maquinas' },
      { label: 'Imóveis',  href: '/listagem?cat=imoveis'  },
      { label: 'Genética', href: '/listagem?cat=genetica' },
      { label: 'Serviços', href: '/listagem?cat=servicos' },
    ],
    help: [
      { label: 'Central de Ajuda',        href: '/institucional?page=ajuda'      },
      { label: 'Política de Privacidade', href: '/institucional?page=privacidade' },
      { label: 'Termos de Uso',           href: '/institucional?page=termos'     },
      { label: 'Denunciar Anúncio',       href: '/institucional?page=denuncia'   },
      { label: 'Fale Conosco',            href: '/institucional?page=contato'    },
    ],
    company: [
      { label: 'Sobre Nós',         href: '/institucional?page=sobre'              },
      { label: 'Planos Premium',    href: '/painel#billing'                },
      { label: 'Trabalhe Conosco',  href: '/institucional?page=trabalhe-conosco'   },
      { label: 'Imprensa',          href: '/institucional?page=imprensa'           },
      { label: 'API para Parceiros',href: '/institucional?page=api'                },
    ],
  },
  es: {
    ads: [
      { label: 'Animales',   href: '/listagem?cat=bovinos'  },
      { label: 'Insumos',    href: '/listagem?cat=insumos'  },
      { label: 'Maquinaria', href: '/listagem?cat=maquinas' },
      { label: 'Inmuebles',  href: '/listagem?cat=imoveis'  },
      { label: 'Genética',   href: '/listagem?cat=genetica' },
      { label: 'Servicios',  href: '/listagem?cat=servicos' },
    ],
    help: [
      { label: 'Centro de Ayuda',          href: '/institucional?page=ajuda'      },
      { label: 'Política de Privacidad',   href: '/institucional?page=privacidade' },
      { label: 'Términos de Uso',          href: '/institucional?page=termos'     },
      { label: 'Denunciar Anuncio',        href: '/institucional?page=denuncia'   },
      { label: 'Contáctenos',             href: '/institucional?page=contato'    },
    ],
    company: [
      { label: 'Sobre Nosotros',           href: '/institucional?page=sobre'            },
      { label: 'Planes Premium',           href: '/painel#billing'              },
      { label: 'Trabaja con Nosotros',     href: '/institucional?page=trabalhe-conosco' },
      { label: 'Prensa',                   href: '/institucional?page=imprensa'         },
      { label: 'API para Socios',          href: '/institucional?page=api'              },
    ],
  }
};

// ─── TRUST ITEMS ──────────────────────────────────────────────

export const TRUST_ITEMS = [
  {
    icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    title_pt: 'Pagamento Seguro', title_es: 'Pago Seguro',
    desc_pt: 'Transações protegidas por criptografia bancária. Seu dinheiro seguro até a entrega.',
    desc_es: 'Transacciones protegidas por cifrado bancario. Tu dinero seguro hasta la entrega.',
  },
  {
    icon: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 15 19.79 19.79 0 0 1 1.58 6.42 2 2 0 0 1 3.55 4.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 11.91a16 16 0 0 0 6.12 6.12l1.09-1.09a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
    title_pt: 'Suporte Dedicado', title_es: 'Soporte Dedicado',
    desc_pt: 'Equipe especializada em agronegócio disponível para ajudar vendedores e compradores.',
    desc_es: 'Equipo especializado en agronegocio disponible para ayudar a vendedores y compradores.',
  },
  {
    icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    title_pt: 'Comunidade Agro', title_es: 'Comunidad Agro',
    desc_pt: 'Mais de 12.000 produtores rurais e criadores ativos em toda a região do Mercosul.',
    desc_es: 'Más de 12.000 productores rurales y criadores activos en toda la región del Mercosur.',
  },
  {
    icon: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
    title_pt: 'Busca Inteligente', title_es: 'Búsqueda Inteligente',
    desc_pt: 'Encontre o que precisa com filtros avançados por categoria, preço, raça, localidade e mais.',
    desc_es: 'Encuentra lo que necesitas con filtros avanzados por categoría, precio, raza, localidad y más.',
  },
];
