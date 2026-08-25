-- ACHADO DA AUDITORIA COMPLETA (2026-08-25): denunciar um anúncio sem estar
-- logado sempre falhava, apesar do código (components/ads/AdReportModal.tsx)
-- ser escrito de propósito pra permitir denúncia anônima (reporter_id: null
-- quando não há sessão). A policy "Anyone can report" checava
-- `auth.uid() = reporter_id` — em SQL, NULL = NULL nunca é TRUE (avalia como
-- NULL/desconhecido), então o INSERT anônimo era sempre rejeitado pela RLS,
-- com uma mensagem genérica de erro na tela, sem indicar que era preciso
-- logar.
--
-- Corrigido pra tratar explicitamente o caso anônimo: usuário autenticado
-- continua só podendo denunciar como si mesmo; visitante anônimo (auth.uid()
-- nulo) só pode inserir com reporter_id também nulo — igual à intenção
-- original do código, agora refletida corretamente na policy.
--
-- Segunda causa raiz, achada testando esta correção ao vivo: a própria
-- coluna reporter_id tinha NOT NULL — mesmo com a policy corrigida, o
-- insert anônimo continuava rejeitado (agora por violação de constraint de
-- coluna, código 23502, em vez de RLS). reporter_id nulo é exatamente o
-- valor que o código sempre pretendeu gravar pra denúncia anônima.
alter table public.reports alter column reporter_id drop not null;

drop policy if exists "Anyone can report" on public.reports;

create policy "Anyone can report"
  on public.reports
  for insert
  to public
  with check (
    (auth.uid() = reporter_id)
    or (auth.uid() is null and reporter_id is null)
  );
