'use client';

// BUG CORRIGIDO (varredura de usabilidade): o CTA fixo mobile, quando o
// vendedor não tem WhatsApp cadastrado, virava um botão desabilitado sem
// nenhuma alternativa — mesmo o formulário "Enviar Mensagem Interna" já
// existindo mais acima na mesma tela (AdSidebar). Este botão troca a ação
// pra abrir esse formulário e rolar/focar até ele, em vez de ficar inerte.
//
// AdSidebar (components/ads/AdSidebar.tsx) é uma árvore de componente
// separada desta página — a comunicação usa o mesmo padrão de evento
// global já usado em Header.tsx/PainelClient.tsx ("painel:switchtab").
interface MobileMessageCtaButtonProps {
  label: string;
}

export function MobileMessageCtaButton({ label }: MobileMessageCtaButtonProps) {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('ad:openmessageform'));

    // O formulário só entra no DOM depois que o AdSidebar processa o
    // evento acima e re-renderiza — espera aparecer (poll via
    // requestAnimationFrame, limitado) antes de rolar/focar, em vez de um
    // timeout arbitrário.
    const scrollAndFocus = (retriesLeft: number) => {
      const el = document.getElementById('ad-message-form');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.querySelector<HTMLElement>('textarea, a, button')?.focus();
        return;
      }
      if (retriesLeft > 0) {
        requestAnimationFrame(() => scrollAndFocus(retriesLeft - 1));
      }
    };
    requestAnimationFrame(() => scrollAndFocus(30));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="btn btn--accent ad-mobile-cta-button"
    >
      {label}
    </button>
  );
}
