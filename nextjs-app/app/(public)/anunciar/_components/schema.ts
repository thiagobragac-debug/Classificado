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
  fotos: z.array(z.string().url('A foto deve ser uma URL válida')).max(6, 'Você pode enviar no máximo 6 fotos')
});

export type AnuncioFormValues = z.infer<typeof AnuncioSchema>;

// Re-export AdPayload from supabase.ts para uso no wizard
// status: apenas 'draft' | 'pending' — 'active' é definido pelo servidor após moderação
export type { AdPayload as InsertAdDTO } from '@/lib/supabase';
