-- ============================================================================
--  1 CPF/CNPJ por conta — impede burlar a cota do plano Grátis criando
--  conta nova com o mesmo documento
-- ============================================================================
--
--  PROBLEMA
--
--  Nenhuma constraint impedia duas contas com o mesmo CPF/CNPJ em
--  user_secrets.document_number — a cota de 3 anúncios ativos do plano
--  Grátis (enforce_ad_quota) é por CONTA, não por PESSOA, então criar uma
--  conta nova com e-mail diferente e o mesmo documento contornava a cota
--  trivialmente.
--
--  Confirmado antes de aplicar: 0 linhas com document_number preenchido em
--  produção hoje — nenhum dado existente para entrar em conflito.
--
--  ÍNDICE POR EXPRESSÃO, NÃO NA COLUNA CRUA
--
--  document_number era salvo exatamente como digitado (com ou sem pontuação
--  — "123.456.789-00" e "12345678900" são o mesmo CPF, mas strings
--  diferentes). Uma constraint UNIQUE direto na coluna deixaria passar o
--  mesmo documento em dois formatos. O código (ProfileTab.tsx) agora
--  normaliza pra só dígitos antes de salvar, mas o índice usa
--  regexp_replace mesmo assim — não depende de nenhum caminho de escrita
--  específico continuar normalizando certo pra continuar protegido.
-- ============================================================================

create unique index if not exists user_secrets_document_number_unique
  on public.user_secrets (regexp_replace(document_number, '\D', '', 'g'))
  where document_number is not null and document_number <> '';
