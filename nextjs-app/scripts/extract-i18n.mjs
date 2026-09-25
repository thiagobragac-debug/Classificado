// Extração de i18n pra bootstrapar os apps nativos (Fase 0 do plano de apps
// nativos separados) — consolida o dicionário compartilhado (lib/constants.ts,
// export I18N) mais os dicionários locais `TRANSLATIONS`/`T` espalhados por
// componente (mesmo padrão usado em app/(public)/painel/_components/usePush.ts)
// num único JSON `{chave: {pt, es}}`, prefixando as chaves locais por
// feature/arquivo pra evitar colisão com as chaves globais do I18N.
//
// Roda uma vez, localmente (não faz parte de build/CI). Saída em
// ../i18n-export/strings.json (raiz do repo, sibling de nextjs-app/ e
// mobile/, já que os projetos Android/iOS ainda não existem neste repo).
//
// Uso: node scripts/extract-i18n.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const NEXTJS_APP_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(NEXTJS_APP_ROOT, '..');
const OUT_DIR = path.join(REPO_ROOT, 'i18n-export');
const OUT_FILE = path.join(OUT_DIR, 'strings.json');
const REPORT_FILE = path.join(OUT_DIR, 'extract-report.json');

const EXCLUDE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', 'scripts']);
const DICT_NAMES = ['TRANSLATIONS', 'T'];
const NOISE_SEGMENTS = new Set(['app', 'components', 'lib']);
const INTERPOLATION_RE = /\{[a-zA-Z0-9_]+\}|%[sd]|\$\{[^}]*\}/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function unwrap(node) {
  while (
    node &&
    (ts.isAsExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      node.kind === ts.SyntaxKind.SatisfiesExpression)
  ) {
    node = node.expression;
  }
  return node;
}

// Acha `const NOME = {...}` (top-level ou dentro de função/hook) num source file.
function findDictNode(sourceFile, names) {
  let found = null;
  function visit(node) {
    if (found) return;
    if (
      ts.isVariableDeclaration(node) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      names.includes(node.name.text) &&
      node.initializer
    ) {
      const initializer = unwrap(node.initializer);
      if (ts.isObjectLiteralExpression(initializer)) {
        found = initializer;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function materialize(objNode, sourceFile) {
  const raw = objNode.getText(sourceFile);
  const transpiled = ts.transpileModule(`globalThis.__extracted = (${raw});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(transpiled, sandbox, { timeout: 2000 });
  return sandbox.__extracted;
}

function deriveNamespace(absPath) {
  const rel = path.relative(NEXTJS_APP_ROOT, absPath).replace(/\\/g, '/');
  const noExt = rel.replace(/\.(tsx|ts)$/, '');
  const segments = noExt
    .split('/')
    .filter((seg) => seg && !NOISE_SEGMENTS.has(seg) && seg !== '_components' && !/^\(.*\)$/.test(seg));
  return segments.join('.');
}

function checkParity(dict, sourceLabel, report) {
  if (!dict || typeof dict !== 'object' || !dict.pt || !dict.es) {
    report.skipped.push({ source: sourceLabel, reason: 'faltando chave pt/es no objeto extraído' });
    return null;
  }
  const ptKeys = new Set(Object.keys(dict.pt));
  const esKeys = new Set(Object.keys(dict.es));
  for (const k of ptKeys) {
    if (!esKeys.has(k)) report.parityIssues.push({ source: sourceLabel, key: k, missingIn: 'es' });
  }
  for (const k of esKeys) {
    if (!ptKeys.has(k)) report.parityIssues.push({ source: sourceLabel, key: k, missingIn: 'pt' });
  }
  return dict;
}

function main() {
  const report = { generatedAt: new Date().toISOString(), skipped: [], parityIssues: [], collisions: [], interpolationFlags: [], sources: [] };
  const merged = {};

  // 1. Dicionário compartilhado principal (lib/constants.ts, export I18N)
  const constantsPath = path.join(NEXTJS_APP_ROOT, 'lib', 'constants.ts');
  const constantsSrc = fs.readFileSync(constantsPath, 'utf8');
  const constantsSourceFile = ts.createSourceFile(constantsPath, constantsSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const i18nNode = findDictNode(constantsSourceFile, ['I18N']);
  if (!i18nNode) {
    console.error('ERRO: não achei o export I18N em lib/constants.ts — abortando.');
    process.exit(1);
  }
  const i18nDict = materialize(i18nNode, constantsSourceFile);
  const ptKeys = Object.keys(i18nDict.pt || {});
  const esKeys = Object.keys(i18nDict.es || {});
  const allKeys = new Set([...ptKeys, ...esKeys]);
  for (const key of allKeys) {
    merged[key] = { pt: i18nDict.pt?.[key], es: i18nDict.es?.[key] };
    if (i18nDict.pt?.[key] === undefined) report.parityIssues.push({ source: 'lib/constants.ts', key, missingIn: 'pt' });
    if (i18nDict.es?.[key] === undefined) report.parityIssues.push({ source: 'lib/constants.ts', key, missingIn: 'es' });
  }
  report.sources.push({ file: 'lib/constants.ts', namespace: '(raiz, sem prefixo)', keys: allKeys.size });

  // 2. Dicionários locais TRANSLATIONS/T espalhados por componente
  const allFiles = walk(NEXTJS_APP_ROOT).filter((f) => f !== constantsPath);
  for (const file of allFiles) {
    const rel = path.relative(NEXTJS_APP_ROOT, file).replace(/\\/g, '/');
    const src = fs.readFileSync(file, 'utf8');
    if (!/\b(TRANSLATIONS|T)\s*[:=]\s*\{/.test(src)) continue;

    let sourceFile;
    try {
      sourceFile = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    } catch (e) {
      report.skipped.push({ source: rel, reason: `parse falhou: ${e.message}` });
      continue;
    }

    const dictNode = findDictNode(sourceFile, DICT_NAMES);
    if (!dictNode) continue; // regex bateu mas não achei objeto literal de verdade (falso positivo)

    let dict;
    try {
      dict = materialize(dictNode, sourceFile);
    } catch (e) {
      report.skipped.push({ source: rel, reason: `eval falhou: ${e.message}` });
      continue;
    }

    const namespace = deriveNamespace(file);
    const validated = checkParity(dict, rel, report);
    if (!validated) continue;

    const keys = new Set([...Object.keys(validated.pt), ...Object.keys(validated.es)]);
    for (const key of keys) {
      const namespacedKey = `${namespace}.${key}`;
      // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): deriveNamespace() remove
      // segmentos 'app'/'components'/'lib' de qualquer profundidade — dois
      // arquivos que colapsem pro mesmo namespace (ex: components/Foo.tsx e
      // um futuro app/Foo.tsx) sobrescreviam chaves em silêncio, sem nenhum
      // aviso em report.skipped/console. Detecta e reporta em vez de
      // sobrescrever sem rastro.
      if (Object.prototype.hasOwnProperty.call(merged, namespacedKey)) {
        report.collisions.push({ key: namespacedKey, overwrittenBy: rel });
      }
      merged[namespacedKey] = { pt: validated.pt[key], es: validated.es[key] };
    }
    report.sources.push({ file: rel, namespace, keys: keys.size });
  }

  // 3. Flag de chaves com interpolação (sintaxe difere entre JS/Android/iOS)
  for (const [key, { pt, es }] of Object.entries(merged)) {
    if ((typeof pt === 'string' && INTERPOLATION_RE.test(pt)) || (typeof es === 'string' && INTERPOLATION_RE.test(es))) {
      report.interpolationFlags.push(key);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`Extraídas ${Object.keys(merged).length} chaves de ${report.sources.length} arquivo(s).`);
  console.log(`Ignorados: ${report.skipped.length} arquivo(s) — ver ${path.relative(REPO_ROOT, REPORT_FILE)}`);
  console.log(`Divergências pt/es: ${report.parityIssues.length}`);
  console.log(`Colisões de namespace (chave sobrescrita em silêncio): ${report.collisions.length}`);
  console.log(`Chaves com interpolação (revisar manualmente pra Android/iOS): ${report.interpolationFlags.length}`);
  console.log(`Saída: ${path.relative(REPO_ROOT, OUT_FILE)}`);
}

main();
