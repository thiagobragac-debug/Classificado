import { headers } from 'next/headers';
import type { Lang } from './constants';

// BUG CRÍTICO CORRIGIDO (migração de SEO para URLs de idioma reais): antes
// desta migração, CADA página (generateMetadata E o corpo) tinha sua
// PRÓPRIA cópia de "ler o cookie tc_lang" (em alguns casos, uma segunda
// cópia lendo searchParams.lang também) — foi exatamente essa duplicação
// que causou o bug crítico original: anuncio/[id]/page.tsx e
// vendedor/[id]/page.tsx tinham lógicas de prioridade que divergiram entre
// generateMetadata e o corpo da página, fazendo o hreflang declarar duas
// URLs que serviam o MESMO HTML.
//
// proxy.ts agora decide o locale efetivo de CADA requisição uma única vez
// (prefixo /es na URL > cookie tc_lang > 'pt' — nunca mais por
// Accept-Language, ver comentário lá) e repassa via header x-locale. Esta é
// a ÚNICA função que qualquer Server Component deveria chamar pra saber o
// idioma ativo — nunca leia cookies()/searchParams.lang diretamente numa
// página nova, pra essa classe de bug não voltar a existir.
export async function getLocale(): Promise<Lang> {
  const headersList = await headers();
  return headersList.get('x-locale') === 'es' ? 'es' : 'pt';
}
