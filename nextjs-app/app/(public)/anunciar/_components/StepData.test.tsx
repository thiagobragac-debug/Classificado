// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StepData } from './StepData';
import { createAnuncioSchema, AnuncioFormValues } from './schema';

// StepData.tsx é o passo mais complexo do wizard de anúncio — 3 efeitos
// coordenados (fetch de categorias, fetch de subcategorias dependente da
// categoria, resync de <select> não-controlado depois que as options
// chegam) e uma regra de validação com exceção (categoria sem nenhuma
// subcategoria cadastrada ainda deixa avançar). Cada um desses já foi um
// bug real documentado no próprio arquivo (comentários "GAP CORRIGIDO"/
// "BUG CORRIGIDO"), nunca coberto por teste automatizado (achado numa
// revisão de cobertura, 2026-09-26) — só por teste manual/E2E, que não
// pega o caminho de "categoria sem subcategoria" nem a corrida entre o
// reset() do rascunho e o efeito de troca de categoria.

vi.mock('@/components/RichTextEditor', () => ({
  default: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea
      aria-label="descricao-editor-mock"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const { state } = vi.hoisted(() => ({
  state: {
    categories: [
      { id: 'cat-bovinos', name_pt: 'Bovinos', name_es: 'Bovinos', sort_order: 1, active: true },
      { id: 'cat-equinos', name_pt: 'Equinos', name_es: 'Equinos', sort_order: 2, active: true },
      { id: 'cat-suinos', name_pt: 'Suínos', name_es: 'Cerdos', sort_order: 3, active: true },
    ],
    subcategoriesByCategory: {} as Record<string, Array<{ id: string; name_pt: string; name_es: string }>>,
    categoriesError: false,
  },
}));

function makeQueryBuilder(table: string) {
  let categoryIdFilter: string | undefined;
  const builder = {
    select: () => builder,
    eq: (col: string, val: string) => {
      if (col === 'category_id') categoryIdFilter = val;
      return builder;
    },
    order: () => builder,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      let result: { data: unknown; error: unknown };
      if (table === 'categories') {
        result = state.categoriesError
          ? { data: null, error: new Error('falha simulada') }
          : { data: state.categories, error: null };
      } else if (table === 'subcategories') {
        result = { data: state.subcategoriesByCategory[categoryIdFilter ?? ''] ?? [], error: null };
      } else {
        result = { data: [], error: null };
      }
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: (table: string) => makeQueryBuilder(table) }),
}));

function Harness({
  onNext,
  defaultValues,
}: {
  onNext: () => void;
  defaultValues?: Partial<AnuncioFormValues>;
}) {
  const methods = useForm<AnuncioFormValues>({
    resolver: zodResolver(createAnuncioSchema('pt')),
    defaultValues: {
      titulo: '',
      categoria: '',
      subcategoria: '',
      finalidade: '',
      descricao: '',
      moeda: 'BRL',
      preco: '',
      aNegociar: false,
      unidadePreco: '',
      condicao: '',
      pais: '',
      estado: '',
      cidade: '',
      lat: null,
      lng: null,
      fotos: [],
      video: '',
      ...defaultValues,
    } as AnuncioFormValues,
  });

  return (
    <FormProvider {...methods}>
      <StepData onNext={onNext} />
    </FormProvider>
  );
}

beforeEach(() => {
  state.subcategoriesByCategory = {
    'cat-bovinos': [{ id: 'sub-nelore', name_pt: 'Nelore', name_es: 'Nelore' }],
    'cat-equinos': [{ id: 'sub-crioulo', name_pt: 'Crioulo', name_es: 'Criollo' }],
    'cat-suinos': [],
  };
  state.categoriesError = false;
});

// Sem globals:true no vitest.config.mts, o auto-cleanup do RTL não se
// registra sozinho — sem isto, o DOM de cada render() se acumula entre
// testes (e "getByRole" começa a achar múltiplos botões iguais).
afterEach(cleanup);

describe('StepData — carregamento de categorias', () => {
  it('busca categorias reais e popula o select', async () => {
    render(<Harness onNext={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Bovinos' })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'Equinos' })).toBeInTheDocument();
  });
});

describe('StepData — cascata categoria → subcategoria', () => {
  // BUG-CLASSE evitado (já documentado no código, "GAP CORRIGIDO, auditoria
  // 2026-08-25"): trocar de categoria precisa LIMPAR a subcategoria antiga
  // (senão o form fica com um category_id/subcategory_id incompatíveis) —
  // mas só depois do mount assentar, pra não apagar um rascunho restaurado
  // (ver readyRef/prevCategoriaRef no componente).
  it('trocar de categoria depois do mount zera a subcategoria e carrega as novas opções', async () => {
    render(<Harness onNext={vi.fn()} defaultValues={{ categoria: 'cat-bovinos', subcategoria: 'sub-nelore' }} />);

    const subSelect = screen.getByLabelText(/Raça|Subcategoria/i) as HTMLSelectElement;
    await waitFor(() => expect(subSelect.value).toBe('sub-nelore'));

    // Deixa o readyRef (setTimeout 0) assentar antes de simular a troca —
    // espelha o tempo real entre o mount e uma interação do usuário.
    await new Promise((r) => setTimeout(r, 10));

    const catSelect = screen.getByLabelText(/^Categoria/i) as HTMLSelectElement;
    fireEvent.change(catSelect, { target: { value: 'cat-equinos' } });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Crioulo' })).toBeInTheDocument();
    });
    // A subcategoria antiga (de Bovinos) não pode sobreviver à troca.
    expect(subSelect.value).not.toBe('sub-nelore');
  });

  it('categoria sem NENHUMA subcategoria cadastrada ainda permite avançar (exceção documentada)', async () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);

    fireEvent.change(screen.getByLabelText(/^Título/i), { target: { value: 'Anúncio de teste válido' } });
    const catSelect = screen.getByLabelText(/^Categoria/i) as HTMLSelectElement;
    // O <option value="cat-suinos"> só existe depois que o fetch de
    // categorias resolve — fireEvent.change num <select> ignora em silêncio
    // um value sem option correspondente na árvore.
    await waitFor(() => expect(screen.getByRole('option', { name: 'Suínos' })).toBeInTheDocument());
    fireEvent.change(catSelect, { target: { value: 'cat-suinos' } });
    await waitFor(() => expect(catSelect.value).toBe('cat-suinos'));
    // Deixa o fetch assíncrono de subcategorias (0 resultados pra cat-suinos)
    // resolver e o estado `subcategories` do componente assentar antes de
    // avançar — é esse estado (não o fixture estático do mock) que
    // handleNext realmente lê pra decidir a exceção.
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.change(screen.getByLabelText(/descricao-editor-mock/i), {
      target: { value: 'Descrição de teste com mais de dez caracteres.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Próximo Passo/i }));

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
  });
});

describe('StepData — validação ao avançar', () => {
  it('não avança e mostra os erros quando o Passo 1 está vazio', async () => {
    const onNext = vi.fn();
    render(<Harness onNext={onNext} />);

    fireEvent.click(screen.getByRole('button', { name: /Próximo Passo/i }));

    await waitFor(() => {
      expect(screen.getByText(/mínimo 5 caracteres/i)).toBeInTheDocument();
    });
    // Âncora no início — "A subcategoria é obrigatória" contém "categoria é
    // obrigatória" como substring, então uma regex sem âncora bate nas duas.
    expect(screen.getByText(/^A categoria é obrigatória/i)).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });
});
