import { z } from 'zod';

export const AnuncioSchema = z.object({
  titulo: z.string().min(5, 'O título deve ter no mínimo 5 caracteres').max(100, 'O título deve ter no máximo 100 caracteres'),
  categoria: z.string().min(1, 'A categoria é obrigatória'),
  descricao: z.string().min(10, 'A descrição deve ter no mínimo 10 caracteres').max(5000, 'A descrição deve ter no máximo 5000 caracteres'),
  moeda: z.string(),
  preco: z.string().nullable().optional(),
  aNegociar: z.boolean(),
  unidadePreco: z.string().nullable().optional(),
  condicao: z.string().nullable().optional(),
  pais: z.string().min(1, 'O país é obrigatório'),
  estado: z.string().min(1, 'O estado é obrigatório'),
  cidade: z.string().min(1, 'A cidade é obrigatória'),
  // O máximo de 6 aqui é só um teto de segurança (evita payload gigante) —
  // o limite real do plano do usuário (5/15/30) é aplicado no banco
  // (enforce_ad_media_plan_limits) e refletido na UI do StepPhotos, que
  // busca o valor real em vez de confiar num número fixo.
  fotos: z.array(z.string().url('A foto deve ser uma URL válida')).max(30, 'Você pode enviar no máximo 30 fotos'),
  // BUG CORRIGIDO (verificação ao vivo, 2026-08-25): .url() sozinho rejeita
  // string vazia — como o valor padrão do campo é '' (nenhum vídeo
  // escolhido ainda), a validação do formulário inteiro falhava sempre,
  // pra qualquer usuário, mesmo sem nunca tocar no campo de vídeo. O botão
  // "Publicar Anúncio" ficava mudo (sem toast, sem navegação) porque o
  // react-hook-form nunca considerava o formulário válido.
  video: z.union([z.literal(''), z.string().url('O vídeo deve ser uma URL válida')]).nullable().optional(),
});

export type AnuncioFormValues = z.infer<typeof AnuncioSchema>;

// Re-export AdPayload from supabase.ts para uso no wizard
// status: apenas 'draft' | 'pending' — 'active' é definido pelo servidor após moderação
export type { AdPayload as InsertAdDTO } from '@/lib/supabase';
