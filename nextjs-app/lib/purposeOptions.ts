// Finalidade do anúncio — só se aplica às categorias de animais, onde raça
// (subcategoria) e finalidade são dois eixos de busca independentes (ex.:
// "Nelore de Corte" vs "Nelore Reprodutor"). Conjunto pequeno e fixo por
// categoria — não precisa de tabela no banco (ver migration
// 20260829100100_adiciona_purpose_em_ads.sql).
export interface PurposeOption {
  value: string;
  label_pt: string;
  label_es: string;
}

export const PURPOSE_OPTIONS_BY_CATEGORY: Record<string, PurposeOption[]> = {
  'cat-bovinos': [
    { value: 'corte', label_pt: 'Corte', label_es: 'Carne' },
    { value: 'leite', label_pt: 'Leite', label_es: 'Leche' },
    { value: 'dupla_aptidao', label_pt: 'Dupla Aptidão', label_es: 'Doble Propósito' },
    { value: 'reproducao', label_pt: 'Reprodução', label_es: 'Reproducción' },
  ],
  'cat-equinos': [
    { value: 'esporte', label_pt: 'Esporte', label_es: 'Deporte' },
    { value: 'trabalho', label_pt: 'Trabalho', label_es: 'Trabajo' },
    { value: 'lazer', label_pt: 'Lazer', label_es: 'Ocio' },
    { value: 'reproducao', label_pt: 'Reprodução', label_es: 'Reproducción' },
  ],
  'cat-suinos': [
    { value: 'reproducao', label_pt: 'Reprodução', label_es: 'Reproducción' },
    { value: 'terminacao', label_pt: 'Terminação', label_es: 'Terminación' },
    { value: 'leitao', label_pt: 'Leitão', label_es: 'Lechón' },
  ],
  'caprinos': [
    { value: 'leite', label_pt: 'Leite', label_es: 'Leche' },
    { value: 'corte', label_pt: 'Corte', label_es: 'Carne' },
    { value: 'reproducao', label_pt: 'Reprodução', label_es: 'Reproducción' },
  ],
  'cat-ovinos': [
    { value: 'la', label_pt: 'Lã', label_es: 'Lana' },
    { value: 'corte', label_pt: 'Corte', label_es: 'Carne' },
    { value: 'reproducao', label_pt: 'Reprodução', label_es: 'Reproducción' },
  ],
  'cat-imoveis': [
    { value: 'venda', label_pt: 'Venda', label_es: 'Venta' },
    { value: 'arrendamento', label_pt: 'Arrendamento', label_es: 'Arriendo' },
  ],
};

export function getPurposeOptions(categoryId?: string): PurposeOption[] {
  if (!categoryId) return [];
  return PURPOSE_OPTIONS_BY_CATEGORY[categoryId] || [];
}

// Rótulo do campo/filtro de subcategoria — o nome do "eixo" de busca muda
// por categoria (raça pros animais, tipo de imóvel pra Imóveis Rurais);
// o genérico "Subcategoria" só serve de fallback pras categorias onde o
// eixo não tem nome próprio (Máquinas, Insumos, Serviços etc.).
interface SubcategoryLabels {
  label_pt: string;
  label_es: string;
  allLabel_pt: string;
  allLabel_es: string;
}

const SUBCATEGORY_LABELS_BY_CATEGORY: Record<string, SubcategoryLabels> = {
  'cat-bovinos': { label_pt: 'Subcategoria (Raça)', label_es: 'Subcategoría (Raza)', allLabel_pt: 'Todas as Raças', allLabel_es: 'Todas las Razas' },
  'cat-equinos': { label_pt: 'Subcategoria (Raça)', label_es: 'Subcategoría (Raza)', allLabel_pt: 'Todas as Raças', allLabel_es: 'Todas las Razas' },
  'cat-suinos': { label_pt: 'Subcategoria (Raça)', label_es: 'Subcategoría (Raza)', allLabel_pt: 'Todas as Raças', allLabel_es: 'Todas las Razas' },
  'caprinos': { label_pt: 'Subcategoria (Raça)', label_es: 'Subcategoría (Raza)', allLabel_pt: 'Todas as Raças', allLabel_es: 'Todas las Razas' },
  'cat-ovinos': { label_pt: 'Subcategoria (Raça)', label_es: 'Subcategoría (Raza)', allLabel_pt: 'Todas as Raças', allLabel_es: 'Todas las Razas' },
  'cat-imoveis': { label_pt: 'Tipo de Imóvel', label_es: 'Tipo de Inmueble', allLabel_pt: 'Todos os Tipos de Imóvel', allLabel_es: 'Todos los Tipos de Inmueble' },
};

const DEFAULT_SUBCATEGORY_LABELS: SubcategoryLabels = {
  label_pt: 'Subcategoria', label_es: 'Subcategoría',
  allLabel_pt: 'Todas as Subcategorias', allLabel_es: 'Todas las Subcategorías',
};

export function getSubcategoryLabels(categoryId?: string): SubcategoryLabels {
  if (!categoryId) return DEFAULT_SUBCATEGORY_LABELS;
  return SUBCATEGORY_LABELS_BY_CATEGORY[categoryId] || DEFAULT_SUBCATEGORY_LABELS;
}
