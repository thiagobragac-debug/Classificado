import type { CapacitorConfig } from '@capacitor/cli';

// appId no formato reverse-DNS do domínio (tauzeclass.com.br) — é o
// identificador único do app nas lojas (Play Store/App Store), imutável
// depois da primeira publicação. Fácil de trocar agora, quase impossível
// depois.
const config: CapacitorConfig = {
  appId: 'br.com.tauzeclass.app',
  appName: 'Tauze Class',
  webDir: 'www',
  server: {
    // Modo "remoto": o app abre direto o site de produção já pronto, em
    // vez de empacotar uma cópia estática dentro do .apk/.ipa — mesma
    // lógica de sempre ter a versão mais nova sem precisar publicar
    // atualização de app toda vez que o site muda. `www/index.html` acima
    // só existe porque o Capacitor exige um webDir local, mas na prática
    // nunca é o que o usuário vê.
    url: 'https://tauzeclass.com.br',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
