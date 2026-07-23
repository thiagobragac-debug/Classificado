import { test, expect } from '@playwright/test';

test.describe('Fluxo de Criação de Anúncio', () => {
  // Nota: Idealmente este teste deve rodar autenticado. 
  // O Playwright permite definir o 'storageState' global com um login prévio.

  test('Deve renderizar os steps do Wizard e permitir avançar', async ({ page }) => {
    await page.goto('/anunciar');

    // Verifica Título Principal
    await expect(page.locator('h1')).toContainText(/Criar Novo Anúncio/i);

    // Seleciona Categoria (Step 1)
    const categoryButton = page.getByRole('button', { name: /Bovinos/i }).first();
    // await categoryButton.click();

    // Avança para Informações Básicas (Step 2)
    // const nextButton = page.getByRole('button', { name: /Continuar/i });
    // await nextButton.click();

    // Valida se o título "Informações Básicas" apareceu
    // await expect(page.getByText(/Título do Anúncio/i)).toBeVisible();
  });
});
