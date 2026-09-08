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
// verdade. Ficam de fora dos projetos abaixo por enquanto (exigem sessão
// autenticada real, fora do escopo deste smoke test).
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'responsive-smoke.spec.ts',
  // BUG CORRIGIDO (achado ao vivo rodando o suite pela primeira vez):
  // fullyParallel:true com os 4 projetos abertos ao mesmo tempo (cada um
  // seu próprio Chromium) contra um único `next dev` sobrecarregou o
  // sandbox — testes que passavam perfeitamente sozinhos (confirmado
  // isolando cada passo) davam timeout de 30s rodando todos juntos.
  // workers:2 mantém alguma paralelização sem saturar.
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
    { name: 'mobile-320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 700 } } },
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
    { name: 'tablet-900', use: { ...devices['Desktop Chrome'], viewport: { width: 900, height: 800 } } },
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
