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
              isSkippedMoment?: () => boolean;
              isDismissedMoment?: () => boolean;
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

/**
 * Abre o seletor de conta da Google (One Tap / FedCM) e resolve com o ID
 * token + nonce cru assim que o usuário escolhe uma conta — pronto pra
 * passar direto pra supabase.auth.signInWithIdToken({ provider: 'google',
 * token: idToken, nonce }).
 *
 * Rejeita com GoogleSignInCancelled se o usuário fechar o seletor sem
 * escolher nada (não é um erro de verdade, não deveria virar mensagem de
 * alerta) — qualquer outro erro rejeita normalmente.
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
      reject(new Error('SDK do Google não carregou corretamente.'));
      return;
    }

    let settled = false;

    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (settled) return;
        settled = true;
        resolve({ idToken: response.credential, nonce });
      },
      nonce: hashedNonce,
      use_fedcm_for_prompt: true,
    });

    google.accounts.id.prompt((notification) => {
      if (settled) return;
      if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.() || notification?.isDismissedMoment?.()) {
        settled = true;
        reject(new GoogleSignInCancelled());
      }
    });
  });
}
