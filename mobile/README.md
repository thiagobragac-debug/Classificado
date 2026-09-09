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

## Pontos que ainda faltam antes de publicar nas lojas

1. **Login com Google vai falhar dentro do app.** O Google bloqueia login
   OAuth dentro de WebView embutida (regra de segurança deles, não é bug
   nosso) — o botão "Continuar com Google" do site vai dar erro
   `disallowed_useragent` rodando dentro do app. Login por e-mail/senha
   funciona normal. Correção: abrir o fluxo do Google no navegador do
   sistema (`@capacitor/browser`) em vez da WebView interna — não
   implementado ainda, precisa de um ajuste pontual no código do site.
2. **Links de e-mail (confirmar cadastro, redefinir senha) abrem no
   navegador do celular, não dentro do app.** Funciona (o link confirma
   normal), só não volta sozinho pro app depois — o usuário confirma no
   navegador e reabre o app manualmente. Dá pra melhorar depois com
   "deep links" (Universal Links/App Links), não é bloqueante.
3. **Push notification** hoje só existe a versão web (chave VAPID). Pra
   push nativo de verdade (ícone/som do sistema, funciona com o app
   fechado) precisaria integrar Firebase Cloud Messaging (Android) e Apple
   Push Notification service (iOS) — trabalho separado, não incluído
   ainda.
4. **Ícone/splash** foram gerados automaticamente a partir do logo do site
   (`assets/logo.png`) — dá pra ajustar o enquadramento/cores rodando
   `npx capacitor-assets generate` de novo com outro arquivo fonte.
5. Antes de publicar de verdade: precisa de conta de desenvolvedor Google
   Play (US$ 25, pagamento único) e conta Apple Developer (US$ 99/ano) —
   nenhuma das duas está configurada ainda.
