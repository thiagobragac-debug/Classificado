#!/usr/bin/env node
/**
 * Aplica limite de tamanho e allowlist de MIME nos buckets do Supabase Storage.
 *
 * POR QUE
 *
 * Os buckets foram criados sem `file_size_limit` e sem `allowed_mime_types`.
 * Qualquer usuário autenticado pode enviar arquivo de qualquer tipo e qualquer
 * tamanho para buckets públicos — abuso de custo de armazenamento e hospedagem
 * de conteúdo arbitrário sob o domínio do projeto. A validação que existe hoje
 * (`accept` no <input> e `file.type.startsWith('image/')`) é client-side e se
 * contorna com uma chamada direta à API usando a anon key.
 *
 * NÃO ESVAZIA NADA
 *
 * No Supabase, esses limites valem apenas para uploads NOVOS. Arquivos já
 * armazenados continuam intactos e acessíveis. Aplicar isto não remove nem
 * invalida nenhum conteúdo existente.
 *
 * O bucket `site-assets` já nasceu com esta configuração e serve de referência.
 *
 * USO
 *
 *   node scripts/aplicar-limites-buckets.mjs            # dry-run: só mostra
 *   node scripts/aplicar-limites-buckets.mjs --aplicar  # aplica de verdade
 *
 * Precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const MB = 1024 * 1024;
const IMAGENS = ['image/png', 'image/jpeg', 'image/webp'];

// SVG fica fora de todas as listas de propósito: carrega script e passaria a
// ser servido sob o domínio de storage do projeto.
const CONFIG = {
  'ad-images':       { fileSizeLimit: 5 * MB,  allowedMimeTypes: IMAGENS },
  'ad-videos':       { fileSizeLimit: 50 * MB, allowedMimeTypes: ['video/mp4', 'video/webm'] },
  'profile-banners': { fileSizeLimit: 5 * MB,  allowedMimeTypes: IMAGENS },
  // KYC aceita PDF além de imagem — documento escaneado costuma vir assim.
  // O limite de 10 MB espelha o que lib/supabase-panel.ts já validava.
  'kyc-docs':        { fileSizeLimit: 10 * MB, allowedMimeTypes: [...IMAGENS, 'application/pdf'] },
};

function lerEnv() {
  const texto = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const pegar = (chave) => (texto.match(new RegExp(`^${chave}=(.+)$`, 'm')) || [])[1]?.trim();
  return { url: pegar('NEXT_PUBLIC_SUPABASE_URL'), key: pegar('SUPABASE_SERVICE_ROLE_KEY') };
}

const aplicar = process.argv.includes('--aplicar');
const { url, key } = lerEnv();
if (!url || !key) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local');
  process.exit(1);
}

const svc = createClient(url, key, { auth: { persistSession: false } });
const fmt = (b) => (b == null ? 'SEM LIMITE' : `${(b / MB).toFixed(0)} MB`);

const { data: buckets, error } = await svc.storage.listBuckets();
if (error) {
  console.error('Erro ao listar buckets:', error.message);
  process.exit(1);
}

console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (use --aplicar para valer) ===\n');

for (const bucket of buckets) {
  const alvo = CONFIG[bucket.name];
  if (!alvo) {
    console.log(`${bucket.name.padEnd(18)} sem regra definida — ignorado`);
    continue;
  }

  const antes = `${fmt(bucket.file_size_limit)} / ${bucket.allowed_mime_types?.join(',') || 'QUALQUER TIPO'}`;
  const depois = `${fmt(alvo.fileSizeLimit)} / ${alvo.allowedMimeTypes.join(',')}`;

  if (!aplicar) {
    console.log(`${bucket.name.padEnd(18)} ${antes}\n${' '.repeat(18)} -> ${depois}\n`);
    continue;
  }

  const { error: err } = await svc.storage.updateBucket(bucket.name, alvo);
  console.log(`${err ? 'FALHA' : 'OK   '} ${bucket.name.padEnd(18)} -> ${depois}${err ? ' | ' + err.message : ''}`);
}

if (aplicar) {
  console.log('\n=== estado final ===');
  const { data: fim } = await svc.storage.listBuckets();
  for (const b of fim) {
    console.log(
      b.name.padEnd(18),
      String(b.public).padEnd(6),
      fmt(b.file_size_limit).padEnd(12),
      b.allowed_mime_types?.join(',') || 'QUALQUER TIPO'
    );
  }
}
