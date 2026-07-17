-- ==========================================
-- AUDITORIA DE SEGURANÇA E BLINDAGEM RLS
-- ==========================================

-- 1. Habilitando RLS em tabelas sensíveis (reforço de segurança)
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Limpando políticas antigas possivelmente inseguras (opcional/cautela)
-- DROP POLICY IF EXISTS "Permitir tudo para todos" ON public.ads;

-- ==========================================
-- POLÍTICAS DA TABELA 'ads' (Anúncios)
-- ==========================================
-- A. Leitura: Qualquer pessoa (até sem login) pode ver os anúncios (necessário para o site público)
CREATE POLICY "Leitura publica de anuncios"
  ON public.ads
  FOR SELECT
  USING (true);

-- B. Inserção: Apenas usuários autenticados podem criar anúncios e apenas para si mesmos
CREATE POLICY "Usuarios autenticados podem criar seus anuncios"
  ON public.ads
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- C. Atualização: Apenas o dono do anúncio pode editar
CREATE POLICY "Donos podem editar seus proprios anuncios"
  ON public.ads
  FOR UPDATE
  USING (auth.uid() = user_id);

-- D. Exclusão: Apenas o dono do anúncio pode excluir
CREATE POLICY "Donos podem excluir seus proprios anuncios"
  ON public.ads
  FOR DELETE
  USING (auth.uid() = user_id);


-- ==========================================
-- POLÍTICAS DA TABELA 'messages' (Chat Privado)
-- ==========================================
-- Apenas remetente ou destinatário podem ler a mensagem
CREATE POLICY "Ler proprias mensagens"
  ON public.messages
  FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Apenas autenticados podem enviar, e o sender_id deve ser o deles mesmos
CREATE POLICY "Enviar mensagens"
  ON public.messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);


-- ==========================================
-- PREPARAÇÃO PARA NOTIFICAÇÕES PUSH
-- ==========================================
-- Tabela para guardar os dispositivos inscritos no Web Push
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    UNIQUE(endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas do Push: Usuário só pode ler/inserir suas próprias inscrições
CREATE POLICY "Ver proprias inscricoes push"
  ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Criar proprias inscricoes push"
  ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Deletar proprias inscricoes push"
  ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
