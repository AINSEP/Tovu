/** Owner request 2026-10-20: exercise Tovu's real OAuth endpoint policy without network I/O. */
import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import fc from 'fast-check';
import { assertSafeProviderEndpoint, assertSafeUserFacingUrl, createTovuOAuthGuard } from '../../endpoint-safety.js';

const parameters = { numRuns: 150, seed: 20261020 };
const octet = fc.integer({ min: 0, max: 255 });
const privateIpv4 = fc.oneof(
  fc.tuple(octet, octet, octet).map(parts => `10.${parts.join('.')}`),
  fc.tuple(fc.integer({ min: 16, max: 31 }), octet, octet).map(parts => `172.${parts.join('.')}`),
  fc.tuple(octet, octet).map(parts => `192.168.${parts.join('.')}`),
  fc.tuple(octet, octet).map(parts => `169.254.${parts.join('.')}`),
);

before(t => {
  if ("diagnostic" in t) t.diagnostic(`fast-check seed=${parameters.seed}, numRuns=${parameters.numRuns}`);
});

test('HTTPS private IPv4 endpoints and device links are refused, including numeric spellings', () => {
  fc.assert(fc.property(privateIpv4, host => {
    const numeric = host.split('.').reduce((value, part) => value * 256 + Number(part), 0);
    for (const spelling of [host, String(numeric), `0x${numeric.toString(16)}`]) {
      const raw = `https://${spelling}/token`;
      assert.throws(() => assertSafeProviderEndpoint(raw, 'token endpoint'), { code: 'OAUTH_UNSAFE_ENDPOINT' });
      assert.throws(() => assertSafeUserFacingUrl(raw), { code: 'OAUTH_UNSAFE_ENDPOINT' });
    }
  }), parameters);
});

test('HTTPS unique-local IPv6 endpoints are refused', () => {
  fc.assert(fc.property(octet, fc.integer({ min: 0, max: 65535 }), (subnet, host) => {
    const raw = `https://[fd${subnet.toString(16).padStart(2, '0')}::${host.toString(16)}]/token`;
    assert.throws(() => assertSafeProviderEndpoint(raw, 'token endpoint'), { code: 'OAUTH_UNSAFE_ENDPOINT' });
    assert.throws(() => assertSafeUserFacingUrl(raw), { code: 'OAUTH_UNSAFE_ENDPOINT' });
  }), parameters);
});

test('public HTTPS endpoints normalize safely while plaintext and userinfo links are refused', () => {
  fc.assert(fc.property(fc.nat({ max: 100000 }), fc.string({ maxLength: 80 }), (id, path) => {
    const raw = `https://AUTH-${id}.example.com/token?q=${encodeURIComponent(path)}`;
    assert.equal(assertSafeProviderEndpoint(raw, 'token endpoint').href, new URL(raw).href);
    assert.equal(assertSafeUserFacingUrl(raw).href, new URL(raw).href);
    assert.throws(() => assertSafeProviderEndpoint(raw.replace('https:', 'http:'), 'token endpoint'), { code: 'OAUTH_UNSAFE_ENDPOINT' });
    const withUserinfo = raw.replace('https://', `https://user-${id}:password@`);
    assert.throws(() => assertSafeUserFacingUrl(withUserinfo), { code: 'OAUTH_UNSAFE_ENDPOINT' });
  }), parameters);
});

test('plaintext loopback requires the explicit development option', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 65535 }), port => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      const raw = `http://${hostname}:${port}/token`;
      assert.throws(() => createTovuOAuthGuard({}).assertSafeUrl({ raw, label: 'token endpoint' }), { code: 'OAUTH_UNSAFE_ENDPOINT' });
      assert.equal(createTovuOAuthGuard({}, { allowLoopbackHttp: true }).assertSafeUrl({ raw, label: 'token endpoint' }).href, new URL(raw).href);
    }
  }), parameters);
});
