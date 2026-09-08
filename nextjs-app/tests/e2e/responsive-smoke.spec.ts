import { test, expect, type Page } from '@playwright/test';

// Teste de fumaça responsivo — pensado especificamente pra pegar a classe
// de bug que só apareceu depois de já estar em produção nesta sessão:
// elemento importante colapsando pra 0x0 (imagem do hero sumindo no
// mobile), elemento esticando pra um tamanho absurdo (cartão flutuante
// virando cápsula gigante), conteúdo vazando da tela (badge do Mercosul,
// nunca detectado sem medir scrollWidth de verdade), e um overlay cobrindo
// o próprio campo que o disparou (busca prendendo o usuário sem saída).
// Roda nos 4 tamanhos de tela definidos em playwright.config.ts — os bugs
// acima só existiam abaixo de 900px; testar só em desktop não teria
// pegado nenhum deles.

async function semOverflowHorizontal(page: Page) {
  const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
  // 1px de tolerância — subpixel rendering pode arredondar diferente
  // entre navegadores sem ser um vazamento de verdade.
  expect(overflow, 'página vazando horizontalmente (elemento mais largo que a tela)').toBeLessThanOrEqual(1);
}

async function elementoVisivelComTamanho(page: Page, selector: string, nomeDescritivo: string) {
  const el = page.locator(selector).first();
  await expect(el, `${nomeDescritivo} (${selector}) deveria estar visível`).toBeVisible();
  const box = await el.boundingBox();
  expect(box, `${nomeDescritivo} (${selector}) não tem bounding box`).not.toBeNull();
  expect(box!.width, `${nomeDescritivo} (${selector}) colapsou pra largura ~0`).toBeGreaterThan(4);
  expect(box!.height, `${nomeDescritivo} (${selector}) colapsou pra altura ~0`).toBeGreaterThan(4);
}

test.describe('Home — smoke responsivo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Deixa as animações de entrada (fade-in-up) e o AnimatedNumber
    // terminarem — testar em pleno estado de transição já causou falso
    // alarme ao vivo nesta sessão (número intermediário, opacidade
    // parcial) sem ser um bug de verdade.
    await page.waitForTimeout(2000);
  });

  test('sem vazamento horizontal', async ({ page }) => {
    await semOverflowHorizontal(page);
  });

  test('header, busca do hero e rodapé sempre visíveis e com tamanho real', async ({ page }) => {
    await elementoVisivelComTamanho(page, 'header, .header, [class*="header" i]', 'Header');
    await elementoVisivelComTamanho(page, '#hero-search-input', 'Campo de busca do hero');
    await elementoVisivelComTamanho(page, 'footer', 'Rodapé');
  });

  test('nenhum cartão flutuante do hero estica pra um tamanho absurdo', async ({ page }) => {
    // BUG CORRIGIDO nesta sessão: .hero-float-card--2 chegou a medir
    // 236px de altura (devia ter ~40-70px) por herdar top E bottom ao
    // mesmo tempo de breakpoints diferentes — um position:absolute com
    // os dois definidos estica pra preencher o vão em vez de usar o
    // tamanho do conteúdo. Cartões só existem/aparecem em alguns
    // breakpoints (ver globals.css); pula quando não há nenhum visível.
    const cards = page.locator('.hero-float-card');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      if (!(await card.isVisible())) continue;
      const box = await card.boundingBox();
      if (!box) continue;
      expect(box.height, `hero-float-card #${i} com altura suspeita (${box.height}px) — parece esticado`).toBeLessThan(120);
    }
  });

  test('busca do hero: abrir sugestões não esconde nem trava o campo', async ({ page }) => {
    // BUG CORRIGIDO nesta sessão: no mobile, o dropdown de sugestões virava
    // position:fixed cobrindo a tela inteira (inclusive por cima do
    // próprio input) — usuário via só a lista, sem campo, sem saída.
    const input = page.locator('#hero-search-input');
    await input.click();
    await expect(page.locator('.search-autocomplete-dropdown')).toBeVisible();

    // O campo tem que continuar visível E o usuário tem que continuar
    // conseguindo digitar nele — é exatamente o que quebrou ao vivo.
    await elementoVisivelComTamanho(page, '#hero-search-input', 'Campo de busca (com sugestões abertas)');
    await input.fill('nelore');
    await expect(input).toHaveValue('nelore');

    // O dropdown não pode consumir a tela inteira (senão não sobra
    // "fora" nenhum pra clicar e fechar).
    const dropdownBox = await page.locator('.search-autocomplete-dropdown').boundingBox();
    const viewport = page.viewportSize();
    if (dropdownBox && viewport) {
      const areaDropdown = dropdownBox.width * dropdownBox.height;
      const areaTela = viewport.width * viewport.height;
      expect(areaDropdown / areaTela, 'dropdown de sugestões está cobrindo a tela quase inteira').toBeLessThan(0.8);
    }

    // Clicar fora tem que fechar — é o único mecanismo de saída que
    // existe (handleClickOutside em HeroSearchBar.tsx); sem "fora"
    // visível, o usuário fica preso.
    await page.locator('h1').click({ force: true });
    await expect(page.locator('.search-autocomplete-dropdown')).toBeHidden();
  });

  test('sem erro de console ao carregar a home', async ({ page }) => {
    const erros: string[] = [];
    page.on('pageerror', (err) => erros.push(err.message));
    await page.reload();
    await page.waitForTimeout(1500);
    expect(erros, `erros de JS no console: ${erros.join(' | ')}`).toEqual([]);
  });
});

test.describe('Listagem — smoke responsivo', () => {
  test('sem vazamento horizontal em /listagem', async ({ page }) => {
    await page.goto('/listagem');
    await page.waitForTimeout(1500);
    await semOverflowHorizontal(page);
  });
});
