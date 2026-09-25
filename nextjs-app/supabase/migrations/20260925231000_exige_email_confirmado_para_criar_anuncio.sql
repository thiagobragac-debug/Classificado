-- BUG CORRIGIDO (achado ao vivo via workflow de auditoria, 2026-09-25):
-- createAd() (chamada por AnunciarWizard.tsx) e a policy de INSERT em
-- public.ads não exigiam e-mail confirmado — mesma lacuna que
-- app/api/contact-seller/route.ts já fechou pra "falar com vendedor"
-- (contas descartáveis, self-service, sem CAPTCHA bloqueando o cadastro
-- em si, só o e-mail nunca é confirmado), mas nunca aplicada à criação do
-- próprio anúncio. Isso deixava a fila de moderação aberta a spam/scam em
-- massa vindo de contas totalmente descartáveis, sem custo de e-mail real.
--
-- Helper reutilizável (mesmo padrão de is_admin()/is_ad_owner()) em vez de
-- repetir a subquery em auth.users em cada policy que precisar disso.
create or replace function public.is_email_confirmed()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  );
end;
$function$;

revoke all on function public.is_email_confirmed() from public;
grant execute on function public.is_email_confirmed() to authenticated;

-- ALTER POLICY (não DROP+CREATE) preserva FOR INSERT/TO exatamente como
-- está — só endurece a condição, zero risco de mudar quem a policy afeta.
alter policy "Users can insert their own ads."
on public.ads
with check (auth.uid() = user_id and public.is_email_confirmed());
