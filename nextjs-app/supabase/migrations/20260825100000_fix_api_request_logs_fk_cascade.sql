-- ACHADO DO RETESTE DO SITE (2026-08-25): excluir uma chave de API em
-- /admin/api-keys não removia os logs dela em api_request_logs — a FK
-- (api_request_logs_api_key_id_fkey) está como ON DELETE SET NULL, então as
-- linhas continuam existindo pra sempre com api_key_id=NULL, sem como saber
-- a qual parceiro pertenciam, e continuam contando pro total agregado do
-- Dashboard de Uso da API mesmo depois da chave não existir mais.
--
-- Corrigido pra ON DELETE CASCADE: os logs só têm sentido no contexto da
-- chave que os gerou (auditoria de uso daquele parceiro específico) — uma
-- vez que a chave é excluída, não há motivo pra reter esses registros
-- órfãos e sem atribuição.
alter table public.api_request_logs
  drop constraint api_request_logs_api_key_id_fkey,
  add constraint api_request_logs_api_key_id_fkey
    foreign key (api_key_id) references public.api_keys(id) on delete cascade;
