/**
 * Error gate, WARN mode (error-system step E0). Runs the three error rules over production source
 * and compares the result with a checked-in debt list that may only shrink. In WARN mode a new or
 * worsened entry is printed and the exit code stays 0; step E11 turns a package to ERROR when its
 * debt rows reach 0 (`--strict` already does that for a local run).
 *
 * The rules are owned by Jini (`scripts/eslint-rules/errors/`). The three files beside the other
 * rules in `development/eslint-rules/` are byte-identical copies; `check-error-rule-copies.mjs`
 * fails when one is edited here. This runner, its lists and its debt file are this repository's own.
 *
 * One precedence order: a sanctioned module is skipped by all three rules; a pure-parse refusal
 * satisfies rule 1 and rule 3's cause clause while rule 2 still reads its words; everything else
 * gets all three.
 *
 * Debt identity is file + rule; the value is a count, so moving lines never churns the list.
 * Usage: `node development/scripts/check-error-gate.mjs` (warn), `--strict` (exit 1 on a new or
 * worsened entry), `--list` (every entry with its lines), `--update` (rewrite the debt list; only for
 * a shrink or the first baseline), `--list --files a.ts,b.ts` (a job's own files, no ratchet).
 */
import { globSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import catchReadsError from '../eslint-rules/catch-reads-error.mjs';
import failureTextFromCatalog from '../eslint-rules/failure-text-from-catalog.mjs';
import noGenericFailureText from '../eslint-rules/no-generic-failure-text.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const debtFile = 'development/scripts/error-gate-debt.json';
const sourceGlob = '{apps,packages}/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}';
const excludedFiles = [
  '**/{__tests__,__mocks__,__fixtures__,__measurements__,test,tests,fixtures}/**',
  '**/*.{test,spec,typecheck,stories,story}.*', '**/*.d.{ts,mts,cts}', '**/{generated,__generated__}/**', '**/*.{generated,gen}.*',
  '**/*.bundle.{js,mjs,cjs}', '**/testing.{ts,tsx}',
];
/**
 * Where a caught value is meant to end up. The reporter, the logger and the reporting modules the
 * design names all live in Jini, so nothing here is sanctioned yet; the three reporter self-guards
 * in this repository stay on the debt list until step E4 removes them.
 */
export const sanctionedModules = [];
/**
 * Reviewed synchronous helpers with no I/O; a call to one keeps a `try` a pure parse. Added by
 * review. `module` is the path of the file that declares the helper (or the end of its import alias).
 * Not listed, on purpose: `readPickedFolders` and `redactAdminRunContextRef`. Both reach
 * `assertExistingAbsoluteDirectory`, which calls `existsSync` and `statSync`, so a catch around them
 * can hide a real filesystem failure.
 */
export const pureHelpers = [
  { name: 'resolveSameOriginPath', module: 'features/site-inspection/published-page' },
  { name: 'isLoopbackHost', module: 'apps/website/src/server/runtime/boot/bind-host' },
  { name: 'resolveBindHost', module: 'apps/website/src/server/runtime/boot/bind-host' },
  { name: 'isLocalAdminUrl', module: 'apps/website/src/server/runtime/boot/local-owner-signin' },
  { name: 'isRecord', module: 'apps/website/src/assistant/byok-meta-tool-result' },
];
const rules = { 'catch-reads-error': catchReadsError, 'no-generic-failure-text': noGenericFailureText, 'failure-text-from-catalog': failureTextFromCatalog };
const ruleNames = Object.keys(rules);

/** The ESLint flat config of the gate: only these rules, inline directives ignored. */
export function errorGateConfig(_required = {}, optional = {}) {
  const helpers = { pureHelpers: optional.pureHelpers ?? pureHelpers };
  return [{
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { errors: { rules } },
    rules: { 'errors/catch-reads-error': ['error', helpers], 'errors/no-generic-failure-text': 'error', 'errors/failure-text-from-catalog': ['error', helpers] },
  }];
}

/** Every finding in production code, grouped by file + rule with a count and the lines. */
export async function findErrorGateViolations(_required = {}, { files: only } = {}) {
  const production = globSync(sourceGlob, { cwd: root, exclude: excludedFiles }).map(file => file.split(path.sep).join('/'))
    .filter(file => !sanctionedModules.includes(file));
  const files = only === undefined ? production : production.filter(file => only.includes(file));
  if (!files.length) throw new Error(only === undefined ? 'No production source files found for the error gate.' : `None of these is a production source file the gate covers: ${only.join(', ')}`);
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, allowInlineConfig: false, errorOnUnmatchedPattern: false, overrideConfig: errorGateConfig() });
  const grouped = new Map();
  for (const result of await eslint.lintFiles(files)) {
    const file = path.relative(root, result.filePath).split(path.sep).join('/');
    for (const message of result.messages) {
      const rule = message.ruleId?.replace(/^errors\//, '');
      if (!ruleNames.includes(rule)) throw new Error(`ESLint failed on ${file}:${message.line ?? '?'}: ${message.message}`);
      const key = `${file}\u0000${rule}`;
      const entry = grouped.get(key) ?? { file, rule, value: 0, lines: [] };
      entry.value += 1;
      entry.lines.push(message.line);
      grouped.set(key, entry);
    }
  }
  return [...grouped.values()].sort((a, b) => a.file.localeCompare(b.file, 'en') || a.rule.localeCompare(b.rule, 'en'));
}

/** Added / worsened / improved / stale entries of `current` relative to the allowed `debt`. */
export function compareErrorGateDebt({ debt, current }, _optional = {}) {
  const index = list => new Map(list.map(item => [`${item.file}\u0000${item.rule}`, item]));
  const allowed = index(debt);
  const actual = index(current);
  const result = { added: [], worsened: [], improved: [], stale: [] };
  for (const [identity, violation] of actual) {
    const prior = allowed.get(identity);
    if (!prior) result.added.push(violation);
    else if (violation.value > prior.value) result.worsened.push({ prior, violation });
    else if (violation.value < prior.value) result.improved.push({ prior, violation });
  }
  for (const [identity, violation] of allowed) if (!actual.has(identity)) result.stale.push(violation);
  return result;
}

async function main(argv) {
  const only = argv.includes('--files') ? argv[argv.indexOf('--files') + 1]?.split(',') : undefined;
  const current = await findErrorGateViolations({}, only === undefined ? {} : { files: only });
  if (argv.includes('--list')) {
    for (const entry of current) console.log(`[${entry.rule}] ${entry.file} (${entry.value}; lines ${entry.lines.join(', ')})`);
    return 0;
  }
  const stored = current.map(({ file, rule, value }) => ({ file, rule, value }));
  if (argv.includes('--update')) { writeFileSync(path.join(root, debtFile), `${JSON.stringify(stored, null, 2)}\n`); console.log(`Wrote ${stored.length} entries to ${debtFile}.`); return 0; }
  const { added, worsened, improved, stale } = compareErrorGateDebt({ debt: JSON.parse(readFileSync(path.join(root, debtFile), 'utf8')), current: stored });
  for (const entry of added) console.log(`New: [${entry.rule}] ${entry.file} (${entry.value})`);
  for (const { prior, violation } of worsened) console.log(`Worse: [${violation.rule}] ${violation.file} (${prior.value} -> ${violation.value})`);
  const shrink = improved.length + stale.length;
  if (shrink) console.log(`${shrink} entries improved or are gone: run with --update to lower the debt list.`);
  const total = stored.reduce((sum, entry) => sum + entry.value, 0);
  const failing = added.length + worsened.length;
  console.log(failing ? `Error gate (WARN mode): ${failing} new or worse entries. Not failing the build yet; fix them or use a named idiom.`
    : `Error gate passed: ${total} findings in ${stored.length} file/rule entries.`);
  return failing && argv.includes('--strict') ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main(process.argv.slice(2));
