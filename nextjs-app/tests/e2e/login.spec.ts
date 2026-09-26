import { test, expect } from '@playwright/test';

// Achado numa revisão de cobertura de testes (2026-09-26): este arquivo já
// existia, mas nunca rodava de verdade (playwright.config.ts::testMatch só
// apontava pra responsive-smoke.spec.ts) e o único teste real que continha
// tinha as etapas de submit/redirecionamento comentadas ("Mock or Setup
// required in DB"). Reescrito com asserts reais de validação client-side
// (react-hook-form + zod, ver LoginForm.tsx) que não dependem de nenhuma
// conta existir no banco — cobre exatamente o tipo de regressão que já
// aconteceu aqui antes (bug corrigido documentado no próprio LoginForm.tsx:
// "Invalid login credentials" vazando cru em inglês, mensagem de senha
// fraca etc.).
//
// NÃO coberto aqui de propósito: o round-trip completo (login com conta
// real → redirecionamento pós-login) exige uma conta de QA dedicada e suas
// credenciais como fixture do projeto — decisão que precisa ser tomada
// explicitamente (não se cria/loga em conta real como efeito colateral de
// escrever um teste). Ver relato desta sessão.
test.describe('Formulário de Login — validação client-side (sem conta real)', () => {
  test('renderiza o formulário com os campos esperados', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Login/i);
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    // AuthContainer também tem um botão de ABA "Entrar" (alterna pra
    // Criar Conta) — nome exato pra não colidir com ele.
    await expect(page.getByRole('button', { name: 'Entrar na Conta' })).toBeVisible();
  });

  test('bloqueia o submit com e-mail vazio e senha vazia, mostrando os dois erros', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Entrar na Conta' }).click();

    await expect(page.locator('#login-email-error')).toBeVisible();
    await expect(page.locator('#login-password-error')).toBeVisible();
    // Nenhuma navegação deve ter ocorrido — a validação client-side barrou
    // o submit antes de qualquer chamada ao Supabase.
    await expect(page).toHaveURL(/\/login/);
  });

  test('bloqueia o submit com e-mail em formato inválido', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#login-email').fill('nao-e-um-email');
    await page.locator('#login-password').fill('qualquer-coisa');
    await page.getByRole('button', { name: 'Entrar na Conta' }).click();

    await expect(page.locator('#login-email-error')).toBeVisible();
    await expect(page.locator('#login-password-error')).not.toBeVisible();
  });

  test('o botão de mostrar/ocultar senha alterna o type do campo', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.locator('#login-password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: /Mostrar senha/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: /Ocultar senha/i }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
