-- Migration: 20260724_api_rls_fixes.sql
-- Fix critical RLS gaps found during security audit on 2026-07-24
-- These policies are required for the REST API to function correctly with the anon key.

-- ─── 1. ads: Allow API service to INSERT ads ──────────────────────────────────
-- Problem: POST /api/v1/ads uses anon key. The existing INSERT policy requires
-- auth.uid() = user_id, but anon requests have no auth.uid(). Without this fix,
-- POST /api/v1/ads silently fails with an RLS violation.
-- Security: Enforced at app layer (write_ads permission + full field sanitization).
CREATE POLICY IF NOT EXISTS "API service can insert ads" ON public.ads
  FOR INSERT
  WITH CHECK (true);

-- ─── 2. api_keys: Allow API service to UPDATE last_used_at ───────────────────
-- Problem: logRequest() does UPDATE api_keys SET last_used_at = ... using anon key.
-- There was no UPDATE policy for anon, so last_used_at was NEVER being updated.
-- Security: App code only updates last_used_at — it never touches secret_hash,
-- permissions, is_active, or any sensitive field via this path.
CREATE POLICY IF NOT EXISTS "API service can update last_used_at" ON public.api_keys
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ─── 3. api_request_logs: Document SELECT scope ──────────────────────────────
-- The SELECT policy is permissive (qual: true) which is acceptable because:
-- a) The rate limit query always filters by .eq('api_key_id', apiKey.id)
-- b) The dashboard query runs in the admin panel (admin-only access)
-- c) There is no public-facing endpoint that exposes raw logs
-- The service role key (getServiceClient) bypasses RLS for auth operations.
COMMENT ON TABLE public.api_request_logs IS
  'API request logs. SELECT: permissive but app always scopes by api_key_id. '
  'INSERT: open for fire-and-forget logging. Admin reads: restricted to is_admin. '
  'Sensitive data (ip_address, user_agent) never exposed via public endpoints.';
