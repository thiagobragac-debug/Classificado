// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// Prova ao vivo do drill-down aprovado pelo usuário ("sim para todos" —
// "se eu clicar nos dashboard consigo ver as informações que compoem?"):
// os 8 cards de KPI eram só números estáticos até esta correção. Testa que
// o clique realmente troca a métrica do gráfico, filtra a tabela de eventos
// e revela a tabela de falhas de webhook — sem precisar de login real de
// admin (proibido automatizar), montando o componente com dados mockados.

const sampleRow = {
  created_at: '2026-09-27T10:00:00Z',
  rss_bytes: 300 * 1024 * 1024,
  heap_used_bytes: 80 * 1024 * 1024,
  uptime_seconds: 3600 * 5,
  db_size_bytes: 100 * 1024 * 1024,
  pg_connections_active: 10,
  pg_connections_max: 60,
  upstash_configured: true,
  webhook_failures_24h: 2,
};

const oomEvent = {
  render_event_id: 'evt-oom',
  event_type: 'server_failed',
  occurred_at: '2026-09-27T09:00:00Z',
  details: { reason: { oomKilled: { memoryLimit: '512MB' } } },
};
const deployEvent = {
  render_event_id: 'evt-deploy',
  event_type: 'deploy_ended',
  occurred_at: '2026-09-27T08:00:00Z',
  details: { deployStatus: 'succeeded' },
};

const webhookFailureRow = {
  id: 'wf-1',
  created_at: '2026-09-27T07:00:00Z',
  gateway: 'stripe',
  event_type: 'invoice.payment_failed',
  reason: 'subscription not found',
  details: {},
};

function makeQueryBuilder(table: string) {
  const builder = {
    select: () => builder,
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      let result: { data: unknown; error: unknown };
      if (table === 'system_health_samples') result = { data: [sampleRow], error: null };
      else if (table === 'render_events_log') result = { data: [oomEvent, deployEvent], error: null };
      else if (table === 'webhook_failures') result = { data: [webhookFailureRow], error: null };
      else result = { data: [], error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: (table: string) => makeQueryBuilder(table) }),
}));

vi.mock('@/components/ui/ConfirmProvider', () => ({
  useConfirm: () => ({ confirm: async () => true }),
}));

vi.mock('@/lib/toast', () => ({
  showToast: () => {},
}));

// happy-dom não implementa scrollIntoView -- só verificamos que o clique
// não quebra, não o comportamento real de scroll.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// fetch usado por loadMaintenanceStatus() -- sem RENDER_API_KEY no teste, o
// botão de manutenção deve simplesmente não aparecer (mesmo comportamento
// documentado no componente).
global.fetch = vi.fn(() => Promise.reject(new Error('sem RENDER_API_KEY no teste'))) as any;

afterEach(cleanup);

import AdminMonitoramento from './page';

describe('AdminMonitoramento — drill-down dos cards de KPI', () => {
  it('mostra a métrica de Memória por padrão', async () => {
    render(<AdminMonitoramento />);
    await waitFor(() => expect(screen.getByText(/Memória \(RSS\) ao Longo do Tempo/)).toBeInTheDocument());
  });

  it('clicar no card de Banco de Dados troca a métrica do gráfico', async () => {
    render(<AdminMonitoramento />);
    await waitFor(() => expect(screen.getByText('Banco de Dados (limite 500MB)')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Banco de Dados (limite 500MB)'));

    await waitFor(() => expect(screen.getByText(/Tamanho do Banco de Dados ao Longo do Tempo/)).toBeInTheDocument());
  });

  it('clicar no card de Heap V8 troca a métrica do gráfico', async () => {
    render(<AdminMonitoramento />);
    await waitFor(() => expect(screen.getByText('Heap V8 (memória JS)')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Heap V8 (memória JS)'));

    await waitFor(() => expect(screen.getByText(/Heap V8 \(memória JS\) ao Longo do Tempo/)).toBeInTheDocument());
  });

  it('clicar no card de Crashes de OOM filtra a tabela de eventos e mostra botão de limpar filtro', async () => {
    render(<AdminMonitoramento />);
    await waitFor(() => expect(screen.getByText('Deploy Concluído')).toBeInTheDocument());
    expect(screen.getByText('OOM')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Crashes de OOM/));

    // Evento de deploy (não-OOM) desaparece, evento de OOM continua.
    await waitFor(() => expect(screen.queryByText('Deploy Concluído')).not.toBeInTheDocument());
    expect(screen.getByText('OOM')).toBeInTheDocument();
    expect(screen.getByText(/limpar filtro/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/limpar filtro/));
    await waitFor(() => expect(screen.getByText('Deploy Concluído')).toBeInTheDocument());
  });

  it('clicar no card de Falhas de Webhook busca e revela a tabela de falhas', async () => {
    render(<AdminMonitoramento />);
    await waitFor(() => expect(screen.getByText('Falhas de Webhook (24h)')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Falhas de Webhook (24h)'));

    await waitFor(() => expect(screen.getByText('subscription not found')).toBeInTheDocument());
    expect(screen.getByText('stripe')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Fechar'));
    await waitFor(() => expect(screen.queryByText('subscription not found')).not.toBeInTheDocument());
  });

  it('card de Upstash Configurado não é clicável (sem ação de drill-down)', async () => {
    render(<AdminMonitoramento />);
    await waitFor(() => expect(screen.getByText('Upstash (Redis) Configurado')).toBeInTheDocument());
    const card = screen.getByText('Upstash (Redis) Configurado').closest('.adm-stat-card');
    expect(card).not.toHaveAttribute('title');
  });
});
