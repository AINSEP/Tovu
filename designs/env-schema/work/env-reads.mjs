#!/usr/bin/env node
// Read-only env-read scanner for the env-schema design (2026-11-16).
// Usage: node env-reads.mjs <repo-label> <repo-root> > reads.tsv
// Regex-based (no TypeScript install needed). Limits are listed in DESIGN.md §0.3.
// Output columns: repo, name, file, line, kind, scope, area
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [label, root] = process.argv.slice(2);
if (!label || !root) { console.error('usage: env-reads.mjs <label> <root>'); process.exit(2); }
const files = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const DEPLOY = /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|fly[^/]*\.toml|[^/]+\.sh|package\.json)$|^\.github\/.*\.ya?ml$|^(deploy|cloud)\/.*\.(ya?ml|toml|sh|json)$/;
const SKIP = /(^|\/)(node_modules|dist|build|coverage|vendor|\.understand-anything|graphify-out)\/|\.min\.js$|(^|\/)ADS-memory\/|^AI-Dev-Shop\/|^cloud-results\//;

const scopeOf = (f) => {
  if (/(__tests__|__mocks__|__fixtures__)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(e2e|test-support|fixtures|evals|testing|conformance)\//.test(f)) return 'test';
  if (/^(development|scripts)\/|\/scripts\/|^cloud\//.test(f)) return 'script';
  if (/(vite|vitest|playwright|eslint|electron-builder|forge)[^/]*\.config\.[cm]?[jt]s$|(^|\/)vite[^/]*\.ts$/.test(f)) return 'build';
  if (!CODE.test(f)) return 'deploy';
  return 'prod';
};
const areaOf = (f) => {
  let m;
  if ((m = /^packages\/([^/]+)\//.exec(f))) return `pkg:${m[1]}`;
  if ((m = /^examples\/([^/]+)\//.exec(f))) return `example:${m[1]}`;
  if (/^apps\/website\/src\/cli\//.test(f)) return 'website-cli';
  if (/^apps\/website\/src\/server\//.test(f)) return 'website-server';
  if ((m = /^apps\/website\/src\/([^/]+)\//.exec(f))) return `website-${m[1]}`;
  if (/^apps\/website\//.test(f)) return 'website-other';
  if (/^apps\/admin\/src\//.test(f)) return 'admin-browser';
  if (/^apps\/admin\//.test(f)) return 'admin-build';
  if (/^apps\/site-chat\/src\//.test(f)) return 'site-chat-browser';
  if (/^apps\/site-chat\//.test(f)) return 'site-chat-build';
  if (/^apps\/desktop\/src\/renderer\//.test(f)) return 'desktop-renderer';
  if (/^apps\/desktop\//.test(f)) return 'desktop-main';
  if (/^development\/e2e\//.test(f)) return 'e2e';
  if (/^(development|scripts)\//.test(f)) return 'dev-scripts';
  if (/^\.github\//.test(f)) return 'ci';
  if (/^(deploy|cloud)\//.test(f)) return 'deploy';
  if (/^sites\//.test(f)) return 'sites';
  return 'root';
};

const rows = [];
const emit = (name, file, line, kind) => rows.push([label, name, file, line, kind, scopeOf(file), areaOf(file)].join('\t'));
const lineAt = (text, idx) => text.slice(0, idx).split('\n').length;

for (const f of files) {
  if (SKIP.test(f)) continue;
  const isCode = CODE.test(f);
  if (!isCode && !DEPLOY.test(f)) continue;
  let text;
  try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; }
  if (!isCode) {
    for (const m of text.matchAll(/\b((?:TOVU|JINI|VITE|OTEL)_[A-Z0-9_]+|NODE_ENV|PORT|ANALYTICS_ROOT_KEY_SEED|COMMENTS_IP_SALT)\b/g)) emit(m[1], f, lineAt(text, m.index), 'deploy-mention');
    continue;
  }
  const seen = new Set(); // "idx" of a name already attributed
  const take = (m, name, kind, off = 0) => { const k = `${m.index + off}:${name}`; if (seen.has(k)) return; seen.add(k); emit(name, f, lineAt(text, m.index), kind); };
  const consts = new Map();
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=;]+)?=\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) consts.set(m[1], m[2]);
  // 1 direct
  const direct = new Set();
  for (const m of text.matchAll(/\bprocess\.env\.([A-Za-z_]\w*)/g)) { direct.add(m.index); const w = /^\s*=[^=]/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 4)); emit(m[1], f, lineAt(text, m.index), w ? 'process.env-write' : 'process.env'); }
  for (const m of text.matchAll(/\bprocess\.env\[\s*(['"`])([^'"`\]]+)\1\s*\]/g)) { direct.add(m.index); emit(m[2], f, lineAt(text, m.index), 'process.env'); }
  for (const m of text.matchAll(/\bprocess\.env\[\s*([^'"`\]\s][^\]]*)\]/g)) {
    direct.add(m.index);
    const expr = m[1].trim();
    if (consts.has(expr)) emit(consts.get(expr), f, lineAt(text, m.index), 'process.env[const]');
    else emit(`<dynamic:${expr.replace(/\s+/g, ' ').slice(0, 60)}>`, f, lineAt(text, m.index), 'dynamic');
  }
  for (const m of text.matchAll(/\bimport\.meta\.env\.([A-Za-z_]\w*)/g)) emit(m[1], f, lineAt(text, m.index), 'import.meta.env');
  for (const m of text.matchAll(/\bimport\.meta\.env\b(?!\s*\.)/g)) emit('<whole:import.meta.env>', f, lineAt(text, m.index), 'whole-env');
  // 2 destructure
  for (const m of text.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*process\.env\b/g)) for (const part of m[1].split(',')) { const n = part.split(/[:=]/)[0].trim(); if (/^[A-Za-z_]\w*$/.test(n)) emit(n, f, lineAt(text, m.index), 'destructure'); }
  // 3 whole-env uses (alias, spread, pass-through)
  for (const m of text.matchAll(/\bprocess\.env\b(?!\s*[.\[])/g)) {
    const before = text.slice(Math.max(0, m.index - 60), m.index);
    const kind = /\.\.\.\s*$/.test(before) ? 'whole-env:spread' : /=\s*$/.test(before) ? 'whole-env:alias' : /\benv\s*:\s*$/.test(before) ? 'whole-env:child-env' : 'whole-env:pass';
    emit('<whole:process.env>', f, lineAt(text, m.index), kind);
  }
  // 4 env-param / alias reads: something ending in env/Env/environment, then .ALL_CAPS or ['ALL_CAPS']
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\??\.([A-Z][A-Za-z0-9_]{2,})\b/g)) {
    const owner = m[1];
    if (owner === 'process.env' || owner === 'import.meta.env') continue;
    if (!/(^|\.)(\w*[eE]nv(ironment)?|ENV)$/.test(owner)) continue;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 4);
    emit(m[2], f, lineAt(text, m.index), /^\s*=[^=]/.test(after) ? 'env-param-write' : 'env-param');
  }
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\[\s*(['"`])([A-Z][A-Z0-9_]{2,})\2\s*\]/g)) {
    const owner = m[1];
    if (owner === 'process.env') continue;
    if (!/(^|\.)(\w*[eE]nv(ironment)?|ENV)$/.test(owner)) continue;
    emit(m[3], f, lineAt(text, m.index), 'env-param');
  }
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\[\s*([A-Za-z_$][\w$.]*)\s*\]/g)) {
    const owner = m[1];
    if (owner === 'process.env') continue;
    if (!/(^|\.)(\w*[eE]nv(ironment)?|ENV)$/.test(owner)) continue;
    if (consts.has(m[2])) emit(consts.get(m[2]), f, lineAt(text, m.index), 'env-param[const]');
    else emit(`<dynamic:${m[2].slice(0, 60)}>`, f, lineAt(text, m.index), 'dynamic-env-param');
  }
  // 5 name literals and object keys (who names / who sets for a child)
  for (const m of text.matchAll(/(['"`])((?:TOVU|JINI)_[A-Z0-9_]+)\1/g)) emit(m[2], f, lineAt(text, m.index), 'name-literal');
  for (const m of text.matchAll(/(?<![.\w'"`])((?:TOVU|JINI)_[A-Z0-9_]+)\s*:(?!:)/g)) emit(m[1], f, lineAt(text, m.index), 'object-key');
  // 6 other ALL_CAPS string literals, only in files that touch an env object (name lists read through helpers)
  if (/\bprocess\.env\b|\b\w*[eE]nv\b\s*[.\[?:,)]/.test(text)) for (const m of text.matchAll(/(['"`])([A-Z][A-Za-z0-9]*(?:_[A-Z0-9]+)+|ComSpec|SystemRoot|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|PATH|PATHEXT|TEMP|TMP|TMPDIR|USER|LOGNAME|SHELL|PORT|WINDIR|DISPLAY)\1/g)) { if (!/^(TOVU|JINI)_/.test(m[2])) emit(m[2], f, lineAt(text, m.index), 'caps-literal'); }
}
console.log(['repo', 'name', 'file', 'line', 'kind', 'scope', 'area'].join('\t'));
console.log(rows.join('\n'));
