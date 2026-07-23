import { z } from 'zod';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export const AnuncioSchema = z.object({
  titulo: z.string().min(5, 'O título deve ter no mínimo 5 caracteres').max(100, 'O título deve ter no máximo 100 caracteres'),
  categoria: z.string().min(1, 'A categoria é obrigatória'),
  descricao: z.string().min(10, 'A descrição deve ter no mínimo 10 caracteres'),
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

export interface InsertAdDTO {
  title_pt: string;
  description: string;
  category_id: string;
  price: number | null;
  currency: string;
  price_unit_pt: string | null;
  country: string;
  state: string;
  city: string;
  negotiable: boolean;
  condition: string | null;
  status: 'draft' | 'pending' | 'active' | 'paused';
  images?: string[];
}
