import { defineConfig } from 'vitest/config';

// Testes unitários de lógica pura — sanitização, assinatura de webhook,
// resolução de IP, seleção de gateway, permissões de API key. Nada aqui toca
// banco, rede ou browser: são as funções cujo comportamento errado já causou
// bug real nesta base (RLS, timing attack, spoofing de IP), e que precisam
// continuar corretas conforme o código muda.
//
// Testes de integração (rotas de API, RLS, migrations) continuam sendo os
// scripts em scratchpad rodados manualmente contra o Supabase de
// desenvolvimento — exigem credenciais que não fazem sentido em CI público.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next', 'tests/e2e'],
  },
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
});
