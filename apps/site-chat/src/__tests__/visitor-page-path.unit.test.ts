import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsVisitorPath } from '../visitor-site-path';

test('visitor navigation uses normalized, same-site public paths and never arbitrary query state', () => {
  for (const path of ['/', '/about', '/docs/introduction']) assert.equal(allowsVisitorPath({ path }), true, path);
  for (const path of ['/admin', '/api/session', '/%61dmin', '/a/../admin', '/%252e%252e/admin', '//other.test', '/\\other.test', '/public?next=/admin', '/%3fnext=admin', '/%252fadmin', 'https://other.test', '/bad%']) {
    assert.equal(allowsVisitorPath({ path }), false, path);
  }
});
