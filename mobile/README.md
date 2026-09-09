# Tauze Class — app Android/iOS

App nativo que abre o site de produção (`https://tauzeclass.com.br`) dentro de
uma casca nativa (Capacitor), pra aparecer na Google Play e na App Store sem
duplicar nada do front-end já existente em `../nextjs-app`.

## Como funciona

Não existe front-end próprio aqui. `capacitor.config.ts` aponta `server.url`
direto pro site de produção — o app é essencialmente um navegador dedicado
que carrega o site real. Qualquer mudança publicada no site aparece no app
na próxima vez que ele abrir, sem precisar gerar uma nova versão nas lojas.

## Estrutura

- `capacitor.config.ts` — nome do app, id (`br.com.tauzeclass.app`), URL de produção.
- `assets/logo.png` — logo original, usado só pra gerar os ícones/splash (`npx capacitor-assets generate`).
- `android/` — projeto nativo Android (abre no Android Studio).
- `ios/` — projeto nativo iOS (abre no Xcode — **precisa de um Mac**, não tem como compilar iOS no Windows/Linux).

## Pra rodar

**Android** (precisa do Android Studio + SDK instalado):
```
npm run open:android
```
Abre o projeto no Android Studio. De lá, roda num emulador ou celular
conectado com o botão ▶ normal do Android Studio.

**iOS** (precisa de um Mac com Xcode):
```
npm run open:ios
```

Depois de qualquer mudança no `capacitor.config.ts` ou nos ícones/splash, rodar:
```
npm run sync
```

## Login com Google — corrigido, falta 1 passo manual

O Google bloqueia login OAuth dentro de WebView embutida (regra de
segurança deles, não era bug nosso) — o botão "Continuar com Google"
dava erro `disallowed_useragent` rodando dentro do app.

Corrigido: dentro do app, o login com Google agora abre a tela de
consentimento no **navegador do sistema** (não na WebView), e o retorno
volta pro app através do esquema de URL próprio do app
(`br.com.tauzeclass.app://auth-callback`) em vez de uma URL comum —
código em `nextjs-app/lib/supabase.ts` (função `loginWithGoogle`) e
`nextjs-app/components/CapacitorAuthBridge.tsx`. Login por e-mail/senha
sempre funcionou normal, sem precisar de nada disso.

**Falta 1 passo manual, único, no painel do Supabase** (não dá pra fazer
por código): em Authentication → URL Configuration → Redirect URLs,
adicionar:

```
br.com.tauzeclass.app://auth-callback
```

Sem isso, o Supabase recusa redirecionar pro app (só aceita voltar pra
URLs que estão nessa lista, é assim que evita alguém sequestrar o retorno
do login pra outro app/site).

## Outros pontos que ainda faltam antes de publicar nas lojas

1. **Links de e-mail (confirmar cadastro, redefinir senha) abrem no
   navegador do celular, não dentro do app.** Funciona (o link confirma
   normal), só não volta sozinho pro app depois — o usuário confirma no
   navegador e reabre o app manualmente. Dá pra melhorar depois com
   "deep links" (Universal Links/App Links), não é bloqueante.
2. **Push notification** hoje só existe a versão web (chave VAPID). Pra
   push nativo de verdade (ícone/som do sistema, funciona com o app
   fechado) precisaria integrar Firebase Cloud Messaging (Android) e Apple
   Push Notification service (iOS) — trabalho separado, não incluído
   ainda.
3. **Ícone/splash** foram gerados automaticamente a partir do logo do site
   (`assets/logo.png`) — dá pra ajustar o enquadramento/cores rodando
   `npx capacitor-assets generate` de novo com outro arquivo fonte.
4. Antes de publicar de verdade: precisa de conta de desenvolvedor Google
   Play (US$ 25, pagamento único) e conta Apple Developer (US$ 99/ano) —
   nenhuma das duas está configurada ainda.
