/** SPEC-046 v3 / ADR-054: the owner-approved visitor page boundary. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('SPEC-046 freezes publication, approval, migration and terminal navigation', () => {
  const spec = readFileSync(new URL('../../../../../../ADS-memory/specs/046-site-assistant-page-actions/spec.md', import.meta.url), 'utf8');
  for (const contract of ['VISITOR-PAGE-PUBLICATION', 'VISITOR-PAGE-APPROVAL', 'VISITOR-PAGE-MIGRATION', 'VISITOR-PAGE-TERMINAL']) assert.ok(spec.includes(contract));
});
