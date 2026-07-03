-- Criar tabela de países
CREATE TABLE IF NOT EXISTS public.paises (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    sigla VARCHAR(10) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Criar tabela de estados
CREATE TABLE IF NOT EXISTS public.estados (
    id SERIAL PRIMARY KEY,
    pais_id INTEGER REFERENCES public.paises(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    sigla VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (pais_id, sigla)
);

-- Criar tabela de cidades
CREATE TABLE IF NOT EXISTS public.cidades (
    id SERIAL PRIMARY KEY,
    estado_id INTEGER REFERENCES public.estados(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS e adicionar políticas públicas para leitura (já que são dados públicos de referência)
ALTER TABLE public.paises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura pública de paises" ON public.paises FOR SELECT USING (true);
CREATE POLICY "Permitir leitura pública de estados" ON public.estados FOR SELECT USING (true);
CREATE POLICY "Permitir leitura pública de cidades" ON public.cidades FOR SELECT USING (true);
