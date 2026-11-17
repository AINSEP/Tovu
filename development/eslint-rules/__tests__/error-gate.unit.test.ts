/**
 * @file The error gate on this repository's own sites. The three rules are Jini's (their unit
 * tests live there); this file proves the copies, the reviewed helper list and the precedence
 * order on sites copied from this repository as written.
 *
 * `fixtures/error-gate-sites.json` holds the whole try/catch (or the `.catch` statement) of each
 * site the design names here, with every finding of the three rules on that copy as `line:rule`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Linter } from 'eslint';
import { findRuleCopyDrift, ruleFiles } from '../../scripts/check-error-rule-copies.mjs';
import { compareErrorGateDebt, errorGateConfig, pureHelpers } from '../../scripts/check-error-gate.mjs';

interface CopiedSite { site: string; kind: string; note?: string; expect: 'passes' | 'flagged'; catchLine: number; findings: string[]; imports: string[]; code: string }
const copiedSites = JSON.parse(readFileSync(new URL('./fixtures/error-gate-sites.json', import.meta.url), 'utf8')) as CopiedSite[];
const siteAt = (name: string): CopiedSite => {
  const found = copiedSites.find(site => site.site === name);
  assert.ok(found, `no copied site ${name}`);
  return found;
};

function lint(code: string, filename = 'apps/website/src/example.ts'): string[] {
  return new Linter({ configType: 'flat' }).verify(code, errorGateConfig(), { filename })
    .map(message => (message.fatal ? `fatal: ${message.message}` : `${message.line}:${String(message.ruleId).replace('errors/', '')}`));
}

/** Lints one copied site under its own path, because a reviewed helper is matched by path. */
function copiedSiteFindings(site: CopiedSite): string[] {
  const source = [...site.imports, 'async function* copied() {', site.code, '}'].join('\n');
  return new Linter({ configType: 'flat' }).verify(source, errorGateConfig(), { filename: site.site.slice(0, site.site.lastIndexOf(':')) })
    .map(message => (message.fatal ? `fatal: ${message.message}` : `${message.line - site.imports.length - 1}:${String(message.ruleId).replace('errors/', '')}`));
}

for (const site of copiedSites) {
  test(`copied site ${site.site} (${site.kind}) ${site.expect} rule 1, and the three rules find exactly what is recorded`, () => {
    const found = copiedSiteFindings(site);
    assert.deepEqual(found, site.findings);
    assert.equal(found.includes(`${site.catchLine}:catch-reads-error`), site.expect === 'flagged');
  });
}

test('the copied corpus is the population the design names for this repository', () => {
  const count = (kind: string, expectation: string) => copiedSites.filter(site => site.kind === kind && site.expect === expectation).length;
  // The design counts 27 passing parse refusals here. 24 pass; 3 call a validator that reads the filesystem (see the note on each).
  assert.deepEqual(
    { passing: count('parse-refusal', 'passes'), flaggedParse: count('parse-refusal', 'flagged'), filesystem: count('validator-reads-filesystem', 'flagged'), failing: count('not-a-parse-refusal', 'flagged') },
    { passing: 24, flaggedParse: 0, filesystem: 3, failing: 2 });
  assert.deepEqual(copiedSites.filter(site => site.kind === 'idiom-site').map(site => site.note).sort(),
    ['idiom site: afterSettled', 'idiom site: bestEffort', 'idiom site: observed', 'idiom site: orFallback']);
});

test('the three sites the judge named pass as written', () => {
  for (const name of ['apps/desktop/src/renderer/SharedKeys.hooks.ts:137', 'apps/website/src/assistant/byok-meta-tool-result.ts:93', 'apps/website/src/features/consent/config.ts:79']) {
    const site = siteAt(name);
    assert.deepEqual(copiedSiteFindings(site).filter(finding => finding.startsWith(`${site.catchLine}:`)), [], name);
  }
});

test('precedence step 2: the publish backstop parse refusal throws fixed words without a cause and passes rules 1 and 3', () => {
  const site = siteAt('apps/website/src/features/publish-content/backstop-service.ts:116');
  assert.match(site.code.slice(site.code.lastIndexOf('catch')), /throw new \w+\(/);
  assert.deepEqual(copiedSiteFindings(site), []);
  // The same catch is in scope for both rules once its try block awaits a call that is not a listed parser.
  const awaited = { ...site, code: site.code.replace('new URL(', 'await resolveUrl(') };
  assert.notEqual(awaited.code, site.code);
  assert.deepEqual([...new Set(copiedSiteFindings(awaited).map(finding => finding.split(':')[1]))].sort(), ['catch-reads-error', 'failure-text-from-catalog']);
});

test('a reviewed helper counts only in the module the list names for it', () => {
  const site = siteAt('apps/website/src/features/consent/request.ts:25');
  assert.deepEqual(copiedSiteFindings(site), []);
  assert.deepEqual(copiedSiteFindings({ ...site, imports: ['import { resolveSameOriginPath } from "#src/features/other/fetch-page";'] }).map(finding => finding.split(':')[1]),
    ['catch-reads-error', 'failure-text-from-catalog']);
  assert.ok(!pureHelpers.some(helper => helper.name === 'readPickedFolders' || helper.name === 'redactAdminRunContextRef'), 'a validator that reads the filesystem is not a pure helper');
});

test('each idiom site, rewritten with its idiom, passes all three rules', () => {
  assert.deepEqual(lint(`import { afterSettled, bestEffort, observed, orFallback } from "@jini-ai/core/errors/idioms";
async function sites() {
  observed({ promise: loader.load() });
  writes = afterSettled({ promise: operation });
  const body = (await orFallback({ work: () => response?.json(), fallback: null, step: "Read the refusal body of a site transfer check" }) ?? {}) as { code?: unknown };
  if (alreadyDetached) void bestEffort({ work: () => bridge.chatDetach({ subscriptionId }), step: "Detach a closed chat pane", logger });
}`), []);
});

test('the rule copies match their recorded hashes; an edited copy and a copy that differs from the original are named', () => {
  const lock = JSON.parse(readFileSync(new URL('../error-gate-rules.lock.json', import.meta.url), 'utf8')) as { files: Record<string, string> };
  const copies = Object.fromEntries(ruleFiles.map(file => [file, readFileSync(new URL(`../${file}`, import.meta.url))]));
  assert.deepEqual(findRuleCopyDrift({ copies, lock }), []);
  const edited = { ...copies, 'catch-reads-error.mjs': Buffer.concat([copies['catch-reads-error.mjs']!, Buffer.from('\n')]) };
  assert.deepEqual(findRuleCopyDrift({ copies: edited, lock }), [
    'catch-reads-error.mjs does not match the hash recorded in development/eslint-rules/error-gate-rules.lock.json. Rules are edited in Jini and copied here; do not edit the copy.']);
  assert.deepEqual(findRuleCopyDrift({ copies, lock }, { originals: edited }), [
    'catch-reads-error.mjs differs from Jini scripts/eslint-rules/errors/catch-reads-error.mjs. Copy the Jini file here and run this script with --update.']);
  const { 'no-generic-failure-text.mjs': _removed, ...missing } = copies;
  assert.deepEqual(findRuleCopyDrift({ copies: missing, lock }), ['no-generic-failure-text.mjs is missing from development/eslint-rules/. Copy it from Jini scripts/eslint-rules/errors/.']);
});

test('the debt comparison reports new, worse, improved and gone entries by file and rule', () => {
  const entry = (file: string, value: number, rule = 'catch-reads-error') => ({ file, rule, value });
  const result = compareErrorGateDebt({ debt: [entry('a.ts', 2), entry('b.ts', 3), entry('d.ts', 1)], current: [entry('a.ts', 3), entry('b.ts', 1), entry('e.ts', 1)] });
  assert.deepEqual(result.added, [entry('e.ts', 1)]);
  assert.deepEqual(result.worsened, [{ prior: entry('a.ts', 2), violation: entry('a.ts', 3) }]);
  assert.deepEqual(result.improved, [{ prior: entry('b.ts', 3), violation: entry('b.ts', 1) }]);
  assert.deepEqual(result.stale, [entry('d.ts', 1)]);
});
