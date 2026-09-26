import { test, expect } from '@playwright/test';

// Achado numa revisão de cobertura de testes (2026-09-26): este arquivo já
// existia, mas nunca rodava de verdade (playwright.config.ts::testMatch só
// aponta pra responsive-smoke.spec.ts) e o pouco que continha já estava
// errado sem ninguém notar (esperava um <button> "Bovinos" onde na
// verdade há um <select> de categoria, e um h1 "Criar Novo Anúncio" onde o
// texto real é "Criar Anúncio" — confirmado lendo AnunciarWizard.tsx/
// StepData.tsx). Reescrito com asserts reais, sem depender de sessão
// autenticada: o wizard usa "progressive profiling" (AnunciarWizard.tsx —
// login só é exigido no clique de "Publicar", não pra navegar os steps),
// então dá pra testar o Passo 1 completo sem login.
test.describe('Fluxo de Criação de Anúncio (Passo 1 — sem autenticação)', () => {
  test('renderiza o wizard, carrega categorias reais e valida o Passo 1 antes de avançar', async ({ page }) => {
    await page.goto('/anunciar');

    await expect(page.locator('h1')).toHaveText(/Criar Anúncio/i);

    // Categorias vêm de uma query real ao Supabase (StepData.tsx) — GAP já
    // documentado no código: o <select> ficava travado em "Selecione..."
    // indistinguível entre "carregando" e "falhou", sem feedback. Esperar
    // por >1 opção prova que a query real respondeu com dados.
    const categoriaSelect = page.locator('#step-categoria');
    await expect
      .poll(async () => categoriaSelect.locator('option').count(), { timeout: 15000 })
      .toBeGreaterThan(1);

    // Tenta avançar sem preencher nada — deve permanecer no Passo 1 (StepData
    // valida via react-hook-form/zod antes de chamar onNext()).
    await page.getByRole('button', { name: /Próximo Passo/i }).click();
    await expect(page.locator('#step-titulo')).toBeVisible();
    await expect(page.getByText(/A categoria é obrigatória/i)).toBeVisible();

    // Preenche o Passo 1 completo com dados válidos.
    await page.locator('#step-titulo').fill('Trator Massey Ferguson 2018 - teste automatizado');

    // GAP CORRIGIDO já documentado em StepData.tsx: selecionar uma categoria
    // dispara um fetch assíncrono de subcategorias — o <select> de
    // subcategoria só fica habilitado e populado depois disso.
    const primeiraCategoriaValue = await categoriaSelect.locator('option').nth(1).getAttribute('value');
    await categoriaSelect.selectOption(primeiraCategoriaValue!);

    const subcategoriaSelect = page.locator('#step-subcategoria');
    await expect(subcategoriaSelect).toBeEnabled({ timeout: 10000 });
    await expect
      .poll(async () => subcategoriaSelect.locator('option').count(), { timeout: 10000 })
      .toBeGreaterThan(1);
    const primeiraSubcategoriaValue = await subcategoriaSelect.locator('option').nth(1).getAttribute('value');
    await subcategoriaSelect.selectOption(primeiraSubcategoriaValue!);

    // Descrição é um editor rich-text (Quill, ver components/RichTextEditor.tsx)
    // — não é um <textarea> comum, precisa clicar no .ql-editor pra digitar.
    await page.locator('.ql-editor').click();
    await page.keyboard.type('Descrição de teste gerada pelo suite automatizado de E2E.');

    await page.getByRole('button', { name: /Próximo Passo/i }).click();

    // Passo 2 (Localização) renderiza — prova que o Passo 1 passou na
    // validação e o wizard avançou de verdade.
    await expect(page.getByText(/A categoria é obrigatória/i)).not.toBeVisible();
    await expect(page.locator('#step-titulo')).not.toBeVisible();
  });
});
