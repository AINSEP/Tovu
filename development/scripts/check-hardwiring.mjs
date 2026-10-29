/** Host policy for the hardwiring audit; AST and debt mechanisms are owned by @jini-ai/devops.
 * Run: node development/scripts/check-hardwiring.mjs. No tests/builds or production imports.
 * Local source is used while the new devops export awaits publication; CI uses the installed package.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const JINI_ROOT = process.env.JINI_ROOT ?? resolve(ROOT, '../Jini');
const DEBT_PATH = join(ROOT, 'development/scripts/hardwiring-debt.json');

export async function loadInspector(_required = {}, _options = {}) {
  const source = join(JINI_ROOT, 'packages/devops/src/checks/node.ts');
  if (existsSync(source)) {
    const { tsImport } = await import('tsx/esm/api');
    return tsImport(pathToFileURL(source).href, import.meta.url);
  }
  const api = await import('@jini-ai/devops/checks/node');
  if (!api.createHardwiringInspector || !api.installedPublicFunctions || !api.runHardwiring) throw new Error('Publish/adopt @jini-ai/devops with createHardwiringInspector before enabling this guard in a registry-only checkout.');
  return api;
}

const api = await loadInspector();
export const sourceFiles = api.sourceFiles;
export function displayGraphFile({ file, root = ROOT }, _options = {}) {
  return api.displayGraphFile({ file, root });
}
export function createResolver({ root = ROOT, runtime = false }, _options = {}) {
  return api.createResolver({ root, runtime, compiler: ts, aliases: {
    '#src/': join(root, 'apps/website/src'), '@/': join(root, 'apps/admin/src'),
  } });
}

/** Runtime and installed plugin roots are distinct owners. No plugin facade exception after 10-09. */
export function pluginIdentity({ file }, _options = {}) {
  const normalized = file.replaceAll('\\', '/');
  const runtime = normalized.match(/(?:^|\/)features\/(plugin-runtime|agent-plugins)(?:\/|$)/);
  if (runtime) return runtime[1];
  const plugin = normalized.match(/(?:^|\/)(?:content\/(agent-plugins|plugins)|apps\/website\/src\/features\/(plugins))\/([^/]+)\//);
  return plugin ? `${plugin[1] ?? plugin[2]}/${plugin[3]}` : undefined;
}

/** Only checks wired into envSnapshot and an actual refusal branch count; comments/other keys do not. */
export function bootCoveredEnv({ inspector, wiringSource, refusalSource }, _options = {}) {
  const wiring = inspector.parse({ file: 'boot-readiness-gate.ts', source: wiringSource });
  const refusal = inspector.parse({ file: 'production-readiness-gate.ts', source: refusalSource });
  const refusedFields = new Set();
  function collectRefusals(node) {
    if (ts.isIfStatement(node) && ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'envSnapshot') {
      let refuses = false;
      function findCall(child) {
        if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === 'unsafeDefaultFailure') refuses = true;
        ts.forEachChild(child, findCall);
      }
      findCall(node.thenStatement);
      if (refuses) refusedFields.add(node.expression.name.text);
    }
    ts.forEachChild(node, collectRefusals);
  }
  collectRefusals(refusal);
  const covered = new Set();
  function isDefaultEquality({ value }, _options = {}) {
    if (!ts.isBinaryExpression(value) || value.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return false;
    return ts.isBinaryExpression(ts.isParenthesizedExpression(value.left) ? value.left.expression : value.left);
  }
  function collectDefaultKey({ value }, _options = {}) {
    // The owner-password gate compares both the fallback and an explicitly supplied default.
    if (!isDefaultEquality({ value })) return;
    const left = ts.isParenthesizedExpression(value.left) ? value.left.expression : value.left;
    if (left.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken && left.right.getText(wiring) === value.right.getText(wiring)) {
      const key = inspector.envKey({ node: left.left });
      if (key) covered.add(key);
    }
  }
  function collectCoveredValue({ value }, _options = {}) {
    if (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.ExclamationToken) {
      const key = inspector.envKey({ node: value.operand });
      if (key) covered.add(key);
    }
    collectDefaultKey({ value });
  }
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(wiring) === 'envSnapshot' && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !refusedFields.has(property.name.getText(wiring))) continue;
        collectCoveredValue({ value: property.initializer });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(wiring);
  return covered;
}

/** One scan for the host-specific rules. The public graph follows transitive installed dependencies. */
export async function collectHardwiring(_required = {}, _options = {}) {
  const api = await loadInspector();
  const inspector = api.createHardwiringInspector({ compiler: ts });
  const jiniExports = api.installedPublicFunctions({ root: ROOT, compiler: ts });
  const bootDir = join(ROOT, 'apps/website/src/server/runtime/boot');
  const covered = bootCoveredEnv({ inspector, wiringSource: readFileSync(join(bootDir, 'boot-readiness-gate.ts'), 'utf8'), refusalSource: readFileSync(join(bootDir, 'production-readiness-gate.ts'), 'utf8') });
  const resolver = createResolver({});
  const violations = [];
  const files = [...sourceFiles({ directory: join(ROOT, 'apps') }), ...sourceFiles({ directory: join(ROOT, 'content/agent-plugins') }), ...sourceFiles({ directory: join(ROOT, 'content/plugins') })];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const owner = pluginIdentity({ file });
    violations.push(...inspector.inspect({ file: relative(ROOT, file).replaceAll('\\', '/'), source, mode: 'consumer', jiniExports, bootCoveredEnv: covered,
      pluginIdentity: (candidate) => pluginIdentity({ file: candidate }),
      // Only plugin-owned source needs host resolution; unrelated imports belong to other guards.
      resolveImport: owner ? (specifier) => resolver(specifier, file) : undefined }));
  }
  const publicEntries = [join(ROOT, 'apps/site-chat/src/main.tsx'), ...sourceFiles({ directory: join(ROOT, 'content/public') })];
  violations.push(...inspector.inspectPublicGraph({ entries: publicEntries, readSource: (file) => readFileSync(file, 'utf8'), resolveImport: createResolver({ runtime: true }), displayFile: (file) => displayGraphFile({ file }) }));
  return { api, violations };
}

export async function runHardwiring(_required = {}, { writeBaseline = false } = {}) {
  return api.runHardwiring({ collect: async () => (await collectHardwiring()).violations, debtPath: DEBT_PATH,
    baselineComment: '2026-10-09 hardwiring adoption. Identifying-value occurrence hashes; package-boundary React debt. Shrink after cleanup; never regenerate in CI.' }, { writeBaseline });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if ((await runHardwiring({}, { writeBaseline: process.argv.includes('--write-baseline') })).length) process.exitCode = 1; }
  catch (error) { console.error(`[hardwiring] ${error.message}`); process.exitCode = 1; }
}
