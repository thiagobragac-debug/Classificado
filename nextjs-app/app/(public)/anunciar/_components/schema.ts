import { z } from 'zod';
import type { Lang } from '@/lib/constants';

// Mensagens de validação Zod deste formulário — dependem do idioma ativo.
// Padrão local de TRANSLATIONS (mesmo usado em components/ads/AdsSidebar.tsx),
// já que essas mensagens não têm equivalente no dicionário global I18N.
const MESSAGES = {
  pt: {
    tituloMin: 'O título deve ter no mínimo 5 caracteres',
    tituloMax: 'O título deve ter no máximo 100 caracteres',
    categoria: 'A categoria é obrigatória',
    subcategoria: 'A subcategoria é obrigatória',
    descricaoMin: 'A descrição deve ter no mínimo 10 caracteres',
    descricaoMax: 'A descrição deve ter no máximo 5000 caracteres',
    pais: 'O país é obrigatório',
    estado: 'O estado é obrigatório',
    cidade: 'A cidade é obrigatória',
    fotoUrl: 'A foto deve ser uma URL válida',
    fotoMax: 'Você pode enviar no máximo 30 fotos',
    videoUrl: 'O vídeo deve ser uma URL válida',
    precoInvalido: 'O preço deve ser um número válido e não negativo',
  },
  es: {
    tituloMin: 'El título debe tener al menos 5 caracteres',
    tituloMax: 'El título debe tener como máximo 100 caracteres',
    categoria: 'La categoría es obligatoria',
    subcategoria: 'La subcategoría es obligatoria',
    descricaoMin: 'La descripción debe tener al menos 10 caracteres',
    descricaoMax: 'La descripción debe tener como máximo 5000 caracteres',
    pais: 'El país es obligatorio',
    estado: 'El estado es obligatorio',
    cidade: 'La ciudad es obligatoria',
    fotoUrl: 'La foto debe ser una URL válida',
    fotoMax: 'Puedes enviar un máximo de 30 fotos',
    videoUrl: 'El video debe ser una URL válida',
    precoInvalido: 'El precio debe ser un número válido y no negativo',
  },
} as const;

// Mesma normalização usada no submit do wizard (AnunciarWizard.tsx): o valor
// vem do CurrencyInput (react-number-format) já sem separador de milhar,
// mas aceitamos também vírgula decimal (padrão BR) por segurança, já que
// initialData/parsed também alimentam este campo a partir de `price.toString()`.
function isValidPrecoString(value: string): boolean {
  const clean = value.replace(/[^\d.,]/g, '').replace(',', '.');
  if (clean === '') return true;
  const num = Number(clean);
  return !isNaN(num) && num >= 0;
}

// Fábrica do schema: as mensagens de erro variam com `lang`, mas o
// FORMATO dos dados é o mesmo nos dois idiomas — por isso AnuncioFormValues
// (abaixo) pode continuar sendo inferido de uma única instância fixa.
export function createAnuncioSchema(lang: Lang = 'pt') {
  const m = MESSAGES[lang] ?? MESSAGES.pt;

  return z.object({
    titulo: z.string().min(5, m.tituloMin).max(100, m.tituloMax),
    categoria: z.string().min(1, m.categoria),
    subcategoria: z.string().min(1, m.subcategoria),
    finalidade: z.string().nullable().optional(),
    descricao: z.string().min(10, m.descricaoMin).max(5000, m.descricaoMax),
    moeda: z.string(),
    preco: z.string().nullable().optional().refine(
      (val) => !val || isValidPrecoString(val),
      m.precoInvalido
    ),
    aNegociar: z.boolean(),
    unidadePreco: z.string().nullable().optional(),
    condicao: z.string().nullable().optional(),
    pais: z.string().min(1, m.pais),
    estado: z.string().min(1, m.estado),
    cidade: z.string().min(1, m.cidade),
    // O máximo de 6 aqui é só um teto de segurança (evita payload gigante) —
    // o limite real do plano do usuário (5/15/30) é aplicado no banco
    // (enforce_ad_media_plan_limits) e refletido na UI do StepPhotos, que
    // busca o valor real em vez de confiar num número fixo.
    fotos: z.array(z.string().url(m.fotoUrl)).max(30, m.fotoMax),
    // BUG CORRIGIDO (verificação ao vivo, 2026-08-25): .url() sozinho rejeita
    // string vazia — como o valor padrão do campo é '' (nenhum vídeo
    // escolhido ainda), a validação do formulário inteiro falhava sempre,
    // pra qualquer usuário, mesmo sem nunca tocar no campo de vídeo. O botão
    // "Publicar Anúncio" ficava mudo (sem toast, sem navegação) porque o
    // react-hook-form nunca considerava o formulário válido.
    video: z.union([z.literal(''), z.string().url(m.videoUrl)]).nullable().optional(),
  });
}

// Instância fixa em PT usada apenas para inferir o tipo TS do formulário
// (o formato dos campos não muda entre idiomas, só as mensagens de erro).
export const AnuncioSchema = createAnuncioSchema('pt');

export type AnuncioFormValues = z.infer<typeof AnuncioSchema>;

// Re-export AdPayload from supabase.ts para uso no wizard
// status: apenas 'draft' | 'pending' — 'active' é definido pelo servidor após moderação
export type { AdPayload as InsertAdDTO } from '@/lib/supabase';
