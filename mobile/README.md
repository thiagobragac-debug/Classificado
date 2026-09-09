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

**Android — já testado e confirmado funcionando** (2026-09-09): Android
Studio + SDK + emulador instalados nesta máquina, app compilado e
instalado num emulador (`medium_phone`, Android 16), carregou a home real
do site dentro do WebView do app. Único jeito de confirmar de verdade que
o app funciona é ver rodando — não dá pra confiar só na configuração.

```
npm run open:android
```
Abre o projeto no Android Studio. De lá, roda num emulador ou celular
conectado com o botão ▶ normal do Android Studio.

Ou via linha de comando (o que foi usado pra testar): `android emulator
start medium_phone` (emulador já criado) e depois `.\gradlew.bat
assembleDebug` dentro de `android/` pra gerar o APK — ver "Problemas
conhecidos" abaixo se a build falhar com erro de loopback/socket.

**iOS** (precisa de um Mac com Xcode):
```
npm run open:ios
```

Depois de qualquer mudança no `capacitor.config.ts` ou nos ícones/splash, rodar:
```
npm run sync
```

### Problemas conhecidos ao compilar via linha de comando neste Windows

Achados testando pela primeira vez nesta máquina — nenhum é bug do
projeto, são só o ambiente local:

1. **`java.io.IOException: Unable to establish loopback connection`** —
   o Java (versão nova, JDK 25, vem junto com o Android Studio) usa
   Unix Domain Socket internamente pro Gradle se comunicar consigo mesmo,
   e isso quebra se o caminho da pasta temporária (`%TEMP%`) for grande
   demais. Contornado rodando com `$env:TEMP="C:\t"` antes do build (só
   nesta sessão de terminal, não precisa mudar nada permanente).
2. **`Unsupported class file major version 69`** — Gradle 8.14.3 (deste
   projeto) ainda não entende bytecode do JDK 25. Precisa apontar
   `JAVA_HOME` pra um JDK mais antigo (testado com JDK 21) só pra
   compilar — o app final não depende dessa versão, é só ferramenta de
   build.
3. **`SDK location not found`** — falta um `android/local.properties`
   (não é versionado de propósito, é por máquina) com `sdk.dir=` apontando
   pro SDK instalado.

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
