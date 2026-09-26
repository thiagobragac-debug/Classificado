import { defineConfig, devices } from '@playwright/test';

// GAP CORRIGIDO (achado ao vivo pelo usuário: vários bugs de layout
// responsivo — imagem sumindo, cartão flutuante virando cápsula gigante,
// badge cortando texto, overlay de busca prendendo o usuário — só foram
// descobertos DEPOIS de já estarem em produção, por print de celular real).
// Nenhum desses bugs aparece testando só no desktop (viewport largo, sem
// as media queries de mobile entrando em jogo) — por isso os projetos
// abaixo cobrem os tamanhos de tela onde essa classe de bug realmente
// acontece: menor celular comum (320px), celular padrão (375px), tablet/
// desktop estreito (900px, exatamente o breakpoint mais usado no CSS) e
// desktop largo (1440px).
//
// tests/e2e/anunciar.spec.ts e login.spec.ts já existiam no repo antes
// desta configuração, escritos pra Playwright, mas a dependência nunca
// tinha sido instalada nem havia config nenhuma — nunca rodaram de
// verdade (ficavam de fora do testMatch global) e o pouco que continham
// já estava incorreto sem ninguém notar (locators que não batiam com o
// DOM real). Reescritos numa revisão de cobertura de testes (2026-09-26)
// pra testar o que dá pra testar sem depender de uma conta real (o wizard
// de anúncio usa "progressive profiling" — login só é exigido no publish
// final, não pra navegar os steps; o form de login se valida inteiro no
// client antes de qualquer chamada ao Supabase) — ver comentário no topo
// de cada spec sobre o que fica de fora de propósito.
export default defineConfig({
  testDir: './tests/e2e',
  // BUG CORRIGIDO (achado ao vivo rodando o suite pela primeira vez):
  // fullyParallel:true com os 4 projetos de responsividade abertos ao
  // mesmo tempo (cada um seu próprio Chromium) contra um único `next dev`
  // sobrecarregou o sandbox — testes que passavam perfeitamente sozinhos
  // (confirmado isolando cada passo) davam timeout de 30s rodando todos
  // juntos. workers:2 mantém alguma paralelização sem saturar.
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'mobile-320', testMatch: 'responsive-smoke.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 700 } } },
    { name: 'mobile-375', testMatch: 'responsive-smoke.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
    { name: 'tablet-900', testMatch: 'responsive-smoke.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 900, height: 800 } } },
    { name: 'desktop-1440', testMatch: 'responsive-smoke.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // Fluxos funcionais (não é teste de layout responsivo — roda numa
    // viewport só, não precisa dos 4 tamanhos acima).
    { name: 'functional', testMatch: ['anunciar.spec.ts', 'login.spec.ts'], use: { ...devices['Desktop Chrome'] } },
  ],
});
