import assert from 'node:assert/strict';
import test from 'node:test';
import { consentDeclarationReadiness } from '../../readiness.js';

test('diagnostics distinguish valid declarations and unmanaged executable content without changing bytes', () => {
  const html = '<html><head><script src="/stats.js"></script><script data-jini-declared-script src="https://example.test/always.js"></script></head><body><button onclick="privateCode()">Open</button></body></html>';
  const before = html;
  const result = consentDeclarationReadiness({ html, scripts: [{ src: '/stats.js', consent: ['analytics'] }, { src: 'https://example.test/always.js' }], runtimeSlot: false });
  assert.equal(html, before);
  assert.equal(result.declarations.length, 2);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.warnings.map(item => item.code).sort(), ['MISSING_RUNTIME_SLOT', 'UNMANAGED_CONTENT', 'UNMANAGED_CONTENT']);
  assert.ok(result.warnings.some(item => item.source === '/stats.js'), 'a raw duplicate of a declaration still runs unmanaged');
  assert.ok(!JSON.stringify(result).includes('privateCode'));
});

test('refused active plugin declarations remain readiness blockers', () => {
  const result = consentDeclarationReadiness({ html: '<p>Page</p>', scripts: [], runtimeSlot: true,
    problems: ['Active plugin declaration has an unknown consent category.'] });
  assert.deepEqual(result.declarations, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.problems, [{ code: 'INVALID_SCRIPT_DECLARATION', message: 'Active plugin declaration has an unknown consent category.' }]);
});

test('diagnostic source redaction does not mutate the authored declaration', () => {
  const script = Object.freeze({ src: 'https://user:password@example.test/a.js?private=1#private', consent: Object.freeze(['analytics']) });
  const scripts = Object.freeze([script]);
  const result = consentDeclarationReadiness({ html: '<p>Page</p>', scripts, runtimeSlot: true });
  assert.equal(result.declarations[0]!.src, 'https://example.test/a.js');
  assert.equal(script.src, 'https://user:password@example.test/a.js?private=1#private');
  assert.deepEqual(result.problems, []);
});
