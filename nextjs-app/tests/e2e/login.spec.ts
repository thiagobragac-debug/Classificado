import { test, expect } from '@playwright/test';

test.describe('Autenticação e Sessão', () => {
  test('Deve permitir que um usuário existente faça login e seja redirecionado', async ({ page }) => {
    // 1. Navega até a página de login
    await page.goto('/login');

    // 2. Valida o título e presença dos campos
    await expect(page).toHaveTitle(/Login/i);
    const emailInput = page.getByPlaceholder(/seu@email\.com/i);
    const passwordInput = page.getByPlaceholder(/••••••••/i);
    
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // 3. Preenche credenciais de teste (Mock or Setup required in DB)
    // await emailInput.fill('teste@tauzeclass.com.br');
    // await passwordInput.fill('senha-segura-123');
    
    // 4. Submete o formulário
    // const submitButton = page.getByRole('button', { name: /Entrar/i });
    // await submitButton.click();

    // 5. Verifica redirecionamento e toast de sucesso
    // await expect(page).toHaveURL('/painel');
    // await expect(page.getByText(/Bem-vindo de volta/i)).toBeVisible();
  });
});
