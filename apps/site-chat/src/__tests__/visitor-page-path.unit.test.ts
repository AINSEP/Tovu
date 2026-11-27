import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsVisitorPath } from '../visitor-site-path';

test('visitor navigation uses normalized, same-site public paths and never arbitrary query state', () => {
  for (const path of ['/', '/about', '/docs/introduction', '/administer-survey', '/API-guide']) assert.equal(allowsVisitorPath({ path }), true, path);
  for (const path of ['/admin', '/api/session', '/%61dmin', '/a/../admin', '/%252e%252e/admin', '//other.test', '/\\other.test', '/public?next=/admin', '/%3fnext=admin', '/%252fadmin', 'https://other.test', '/bad%']) {
    assert.equal(allowsVisitorPath({ path }), false, path);
  }
});

test('visitor navigation applies the core reserved-segment rule to both the raw and the fully decoded path', () => {
  // Express mounts `/admin/..%2fpublic` under `/admin` even though decoding resolves it to `/public`;
  // a URL parser keeps `/.//admin` as `//admin`, which the core rule still reads as `/admin`.
  for (const path of ['/admin/..%2fpublic', '/.//admin', '/ADMIN/', '/Api', '/%2561dmin', '/blog/%2e%2e/api/x']) {
    assert.equal(allowsVisitorPath({ path }), false, path);
  }
});

test('visitor navigation keeps the strict raw grammar: no query, fragment, backslash or whitespace at any decode depth', () => {
  for (const path of ['/posts?page=2', '/posts#top', '/posts%3Fpage=2', '/posts%2523top', '/a b', '/a%20b', '/a%5Cb', 'about', '']) {
    assert.equal(allowsVisitorPath({ path }), false, path);
  }
});

test('visitor navigation allows a decoded public character at the depth limit but rejects unresolved escapes', () => {
  assert.equal(allowsVisitorPath({ path: '/posts/%2525252541' }), true, 'five decode passes reveal a public segment');
  assert.equal(allowsVisitorPath({ path: '/posts/%252525252541' }), false, 'a sixth pass would be needed');
  assert.equal(allowsVisitorPath({ path: '/posts/%252G' }), false, 'the second decode encounters malformed encoding');
});
