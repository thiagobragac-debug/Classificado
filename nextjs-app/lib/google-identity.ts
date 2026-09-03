// Login com Google via Google Identity Services (GSI) — substitui o fluxo
// antigo de redirect (supabase.auth.signInWithOAuth) por
// supabase.auth.signInWithIdToken(). O SDK da Google roda inteiramente na
// própria página: nenhum redirect, nenhuma saída de domínio, e a tela
// "Prosseguir para <projeto>.supabase.co" (que só existe porque o fluxo de
// redirect usa o Supabase como intermediário do lado do Google) nunca
// aparece — o token vem direto pro navegador via callback JS.
//
// Precisa de NEXT_PUBLIC_GOOGLE_CLIENT_ID (o mesmo Client ID já cadastrado
// no Google Cloud Console — não é segredo, Client IDs são públicos por
// design) e das "Origens JavaScript autorizadas" já configuradas lá
// (https://www.tauzeclass.com.br e http://localhost:3000 — confirmado que
// já estavam corretas, nenhuma mudança necessária no Google Cloud).

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            nonce: string;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          prompt: (
            momentListener?: (notification: {
              isNotDisplayed?: () => boolean;
              getNotDisplayedReason?: () => string;
              isSkippedMoment?: () => boolean;
              getSkippedReason?: () => string;
              isDismissedMoment?: () => boolean;
              getDismissedReason?: () => string;
            }) => void
          ) => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar o script do Google')));
      // Já pode ter carregado antes deste componente montar.
      if (window.google?.accounts?.id) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar o script do Google'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// Nonce em dois formatos, conforme a doc oficial da Supabase pra este
// fluxo: o CRU vai pro signInWithIdToken (confirma que a credencial
// devolvida pela Google corresponde a ESTA tentativa de login, não uma
// reaproveitada), o com HASH SHA-256 vai pro parâmetro `nonce` da própria
// Google (ela nunca vê o valor cru).
async function generateNoncePair(): Promise<{ nonce: string; hashedNonce: string }> {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const encoded = new TextEncoder().encode(nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { nonce, hashedNonce };
}

export class GoogleSignInCancelled extends Error {
  constructor() {
    super('CANCELADO');
    this.name = 'GoogleSignInCancelled';
  }
}

// BUG CORRIGIDO (achado ao vivo testando em produção, 2026-09-02): o
// seletor de conta (FedCM) depende do navegador saber "com qual conta
// Google você está" — isso é o login DO PRÓPRIO CHROME (chrome://settings/
// people), não a mesma coisa que estar logado no Gmail numa aba. Testado
// ao vivo em 3 cenários: aba anônima ("Provider's accounts list is
// empty" — Chrome desliga FedCM de propósito em modo anônimo, por
// privacidade) e aba normal SEM login no Chrome ("Not signed in with the
// identity provider") — os dois casos são reais e não vão sumir só
// porque o código está certo; uma parte real dos usuários (Chrome
// corporativo/gerenciado, quem nunca fez login no navegador, outros
// navegadores) nunca vai ter FedCM disponível. Distingue esse caso
// (isNotDisplayed — o seletor nem chegou a abrir) de um cancelamento de
// verdade (isSkippedMoment/isDismissedMoment — o seletor abriu e o
// usuário fechou) pra quem chama poder cair de volta no fluxo de
// redirect nesse caso específico, em vez de simplesmente falhar.
export class GoogleIdentityUnavailable extends Error {
  constructor(reason?: string) {
    super(`Google Identity Services indisponível neste navegador${reason ? ` (${reason})` : ''}.`);
    this.name = 'GoogleIdentityUnavailable';
  }
}

/**
 * Abre o seletor de conta da Google (One Tap / FedCM) e resolve com o ID
 * token + nonce cru assim que o usuário escolhe uma conta — pronto pra
 * passar direto pra supabase.auth.signInWithIdToken({ provider: 'google',
 * token: idToken, nonce }).
 *
 * Rejeita com GoogleSignInCancelled se o usuário fechar o seletor sem
 * escolher nada (não é um erro de verdade, não deveria virar mensagem de
 * alerta), ou com GoogleIdentityUnavailable se o seletor nem chegou a
 * conseguir abrir neste navegador (quem chama deveria cair pro fluxo de
 * redirect nesse caso) — qualquer outro erro rejeita normalmente.
 */
export async function signInWithGooglePrompt(): Promise<{ idToken: string; nonce: string }> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Login com Google não configurado (NEXT_PUBLIC_GOOGLE_CLIENT_ID ausente).');
  }

  await loadGoogleIdentityScript();
  const { nonce, hashedNonce } = await generateNoncePair();

  return new Promise((resolve, reject) => {
    const google = window.google;
    if (!google?.accounts?.id) {
      reject(new GoogleIdentityUnavailable('SDK não carregou'));
      return;
    }

    let settled = false;

    // BUG CORRIGIDO (achado ao vivo, 2026-09-03): nem initialize() nem
    // prompt() têm timeout embutido — se a notificação de momento da Google
    // nunca chegar (script lento, silencioso, ou algum caso extremo entre o
    // script carregar e o FedCM mediar), a Promise nunca resolve nem
    // rejeita, `settled` nunca vira true, e o botão fica girando pra
    // sempre, sem erro visível e sem cair no fallback de redirect que já
    // existe pra este exato cenário (GoogleIdentityUnavailable). Generoso o
    // bastante pra não interromper um fluxo real do FedCM em andamento
    // (a confirmação normal do usuário de retorno é quase instantânea),
    // curto o bastante pra nunca deixar o usuário girando indefinidamente.
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new GoogleIdentityUnavailable('timeout'));
    }, 8000);

    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve({ idToken: response.credential, nonce });
      },
      nonce: hashedNonce,
      use_fedcm_for_prompt: true,
    });

    // BUG CORRIGIDO (achado ao vivo, 2ª rodada — o ambiente de teste
    // automatizado e o navegador real do usuário classificaram o MESMO
    // tipo de indisponibilidade de formas diferentes: um caiu em
    // isNotDisplayed, o outro em isSkippedMoment com motivo genérico).
    // Só os motivos que a própria Google documenta como decisão CONSCIENTE
    // do usuário ('user_cancel' — fechou de propósito, 'tap_outside' —
    // clicou fora) contam como cancelamento de verdade. Qualquer outro
    // motivo (reason ausente, 'unknown_reason', 'issuing_failed', conta
    // indisponível, etc.) é tratado como "este navegador não consegue
    // completar esse fluxo agora" — cai pro fallback de redirect em vez de
    // simplesmente devolver o botão ao normal sem explicação.
    const MOTIVOS_CANCELAMENTO_DELIBERADO = new Set(['user_cancel', 'tap_outside']);
    google.accounts.id.prompt((notification) => {
      if (settled) return;
      const skippedReason = notification?.getSkippedReason?.();
      const dismissedReason = notification?.getDismissedReason?.();
      const foiCancelamentoDeliberado =
        (notification?.isSkippedMoment?.() && MOTIVOS_CANCELAMENTO_DELIBERADO.has(skippedReason || '')) ||
        (notification?.isDismissedMoment?.() && MOTIVOS_CANCELAMENTO_DELIBERADO.has(dismissedReason || ''));
      if (foiCancelamentoDeliberado) {
        settled = true;
        clearTimeout(timeoutId);
        reject(new GoogleSignInCancelled());
        return;
      }
      if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.() || notification?.isDismissedMoment?.()) {
        settled = true;
        clearTimeout(timeoutId);
        reject(new GoogleIdentityUnavailable(notification.getNotDisplayedReason?.() || skippedReason || dismissedReason));
      }
    });
  });
}
