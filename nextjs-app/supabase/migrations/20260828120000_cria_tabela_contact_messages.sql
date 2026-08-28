-- Cria a tabela que recebe as mensagens do formulário real de "Fale Conosco"
-- (app/(public)/institucional/ContactForm.tsx + app/api/contact/route.ts),
-- que substitui o <form> fake que vinha no HTML da página institucional
-- (tinha um onsubmit só cosmético — fingia sucesso sem enviar a mensagem
-- a lugar nenhum).
--
-- Inserts são feitos pela API route usando o cliente admin (service_role),
-- que ignora RLS — por isso não existe policy de INSERT aqui. A política
-- abaixo cobre apenas a leitura/gestão pelo painel admin (mesmo padrão de
-- `reports`, que usa is_admin()).
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text not null,
  message text not null,
  lang text not null default 'pt',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.contact_messages enable row level security;

create policy "Admins gerenciam mensagens de contato" on public.contact_messages
  for all using (is_admin()) with check (is_admin());

create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);
