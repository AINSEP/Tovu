/** Phase 10 retrieval gate. Run: node --import tsx development/evals/tool-search-credential-save.eval.ts
 * Compare the real production catalog against the frozen six-tool descriptions/keywords on
 * identical credential requests. A baseline miss is never silently counted as a candidate win.
 * The original 58% -> 45% parent-tool regression is why this remains a shipping gate.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEvalToolRegistry, fakeEvalRouteDeps } from './tool-search-eval-registry.js';
import { mcnemarExactP } from './tool-search-parent-tool-read.eval.js';
import { buildToolCatalogQuery } from '../../apps/website/src/assistant/tool-catalog-query.js';
import { indexedDescriptionFor } from '../../apps/website/src/assistant/tool-search-keywords.js';
import { HELD_OUT_V2 } from './tool-search-heldout-v2.js';

const baseline: Array<{ id: string; description: string }> = JSON.parse(readFileSync(new URL('./fixtures/credential-save-baseline.json', import.meta.url), 'utf8'));
const retired = new Set(baseline.map(row => row.id));
assert.equal(retired.size, 6, 'the baseline must retain all six original save tools');
const registrations = buildEvalToolRegistry(fakeEvalRouteDeps()).list({});
assert.equal(registrations.filter(d => d.id === 'credential_save').length, 1);
assert.equal(registrations.some(d => retired.has(d.id)), false, 'no executable save aliases may remain');

// Freeze enrichment once so unchanged tools have byte-identical documents in both arms.
const current = registrations.map(d => ({ ...d, description: indexedDescriptionFor(d.id, d.description ?? '') }));
const template = current.find(d => d.id === 'credential_save')!;
const previous = [...current.filter(d => d.id !== 'credential_save'), ...baseline.map(row => ({ ...template, ...row }))];
const before = buildToolCatalogQuery({ list: () => previous }, { includeSearchKeywords: false });
const after = buildToolCatalogQuery({ list: () => current }, { includeSearchKeywords: false });

interface Case { query: string; expect: readonly string[]; required?: boolean }
const operator: Array<{ query: string; expect: string[] }> = JSON.parse(readFileSync(new URL('../../apps/website/src/assistant/__tests__/fixtures/tool-search-operator-requests.json', import.meta.url), 'utf8'));
const credentialCases: Case[] = JSON.parse(readFileSync(new URL("../../apps/website/src/assistant/__tests__/fixtures/credential-setup-search.json", import.meta.url), "utf8"));
const corpus: Case[] = [
  ...credentialCases,
  ...operator.filter(c => c.expect.some(id => retired.has(id))),
  ...HELD_OUT_V2.map(c => ({ query: c.query, expect: [c.expect, ...(c.alsoAcceptable ?? [])] })).filter(c => c.expect.some(id => retired.has(id))),

];
// Count each request once; duplicate samples would make the paired significance misleading.
const distinct = new Map<string, Case>();
for (const c of corpus) {
  const previous = distinct.get(c.query);
  distinct.set(c.query, { ...c, expect: [...new Set([...(previous?.expect ?? []), ...c.expect])], required: previous?.required || c.required });
}
const cases = [...distinct.values()];
assert.ok(cases.length >= credentialCases.length, 'never score an incomplete credential corpus');
let blocked = false;
for (const cutoff of [1, 3, 5, 10, 20]) {
  let baselineHits = 0; let candidateHits = 0; let baselineOnly = 0; let candidateOnly = 0;
  for (const c of cases) {
    const wasFound = before.search({ query: c.query }, { limit: cutoff }).some(hit => c.expect.includes(hit.id));
    const acceptable = c.expect.map(id => retired.has(id) ? 'credential_save' : id);
    const found = after.search({ query: c.query }, { limit: cutoff }).some(hit => acceptable.includes(hit.id));
    baselineHits += Number(wasFound); candidateHits += Number(found);
    baselineOnly += Number(wasFound && !found); candidateOnly += Number(!wasFound && found);
    if (cutoff === 5 && c.required && !found) { blocked = true; console.error(`Required top-5 miss: ${c.query}`); }
  }
  const p = mcnemarExactP({ baselineOnly, candidateOnly });
  console.log(JSON.stringify({ cutoff, n: cases.length, baselineHits, candidateHits, baselineOnly, candidateOnly, p }));
  if (cutoff === 5 && baselineOnly > candidateOnly && p < 0.05) blocked = true;
}
console.log(blocked ? 'NO-GO: improve the single-tool discovery contract before shipping.' : 'PASS: no significant top-5 regression; all four required credential requests found.');
process.exitCode = blocked ? 1 : 0;
