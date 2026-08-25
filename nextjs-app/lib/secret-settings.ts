// Chaves de `platform_settings` que nunca devem sair do servidor — nem na
// resposta de uma rota, nem numa query direta do navegador, nem gravadas em
// localStorage. Usada tanto em app/api/admin/settings/route.ts (servidor)
// quanto em components/Header.tsx (cliente): uma lista só, pra uma chave
// secreta nova não ficar protegida num lugar e esquecida no outro.
export const SECRET_SETTING_KEYS = [
  'stripe_secret_key',
  'stripe_webhook_secret',
  'mp_access_token',
  'mp_webhook_secret',
  'pagarme_api_key',
  'pagarme_webhook_secret',
  'asaas_api_key',
  'asaas_webhook_token',
] as const;
