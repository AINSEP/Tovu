// F9 (Stryker L15: cloudflare zones 75.8 %, domain-status 69.4 %): the hostname validator per operand
// at its limits (253/254 chars, 63/64-char labels, no dot, bad label edges), the zone ownership guard
// one clause at a time, the Workers binding/certificate conjuncts one at a time, wildcard depth, and
// the polling back-off schedule. Fake API port objects; no network.
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDomain, resolveZone } from '../zones.mjs';
import { pollDomains } from '../domain-status.mjs';

class DeployError extends Error {
  constructor(message, status, details) { super(message); this.status = status; this.details = details; }
}
const kit = { DeployError };
const refusedWith = (code) => (error) => error instanceof DeployError && error.code === code && error.status === 400 && error.message.startsWith(`${code}: `);

const label = (n) => 'a'.repeat(n);
test('normalizeDomain accepts a lower-cased, trimmed, trailing-dot-free hostname at every limit', () => {
  const at253 = [label(63), label(63), label(63), label(61)].join('.');
  assert.equal(at253.length, 253);
  for (const [input, expected] of [
    ['Example.COM', 'example.com'], ['  example.com.  ', 'example.com'], [at253, at253], [`${label(63)}.com`, `${label(63)}.com`],
    ['a.b', 'a.b'], ['x-1.example.com', 'x-1.example.com'], ['1a.example', '1a.example'],
  ]) assert.equal(normalizeDomain({ domain: input, kit }), expected, input);
});

test('normalizeDomain refuses each invalid shape with CLOUDFLARE_INVALID_DOMAIN', () => {
  const at254 = [label(63), label(63), label(63), label(62)].join('.');
  for (const input of [
    at254, 'localhost', '', `${label(64)}.com`, '-a.com', 'a-.com', 'a..com', '.a.com', 'a_b.com', 'https://a.com', 'a.com:443', 'a.com/x', '*.a.com', 'a.com\nb', 'é.com', 'a .com',
  ]) assert.throws(() => normalizeDomain({ domain: input, kit }), refusedWith('CLOUDFLARE_INVALID_DOMAIN'), JSON.stringify(input));
});

function zoneApi(zone, { zones = [{ id: 'z1', name: 'example.com' }] } = {}) {
  const calls = [];
  return {
    calls, kit, accountId: 'acct', accountPath: '/accounts/acct',
    async list(input) { calls.push(['list', input.path]); return zones; },
    async request(input) { calls.push(['request', input.path]); return zone; },
  };
}
const goodZone = { name: 'example.com', account: { id: 'acct' }, status: 'active', type: 'full' };

test('resolveZone: only an active, full zone of exactly this domain in exactly this account', async () => {
  assert.deepEqual(await resolveZone({ api: zoneApi(goodZone), domain: 'example.com' }), { id: 'z1', name: 'example.com' });
  for (const [zone, code] of [
    [{ ...goodZone, name: 'other.com' }, 'CLOUDFLARE_ZONE_MISMATCH'], [{ ...goodZone, account: { id: 'other' } }, 'CLOUDFLARE_ZONE_MISMATCH'],
    [{ ...goodZone, account: undefined }, 'CLOUDFLARE_ZONE_MISMATCH'], [null, 'CLOUDFLARE_ZONE_MISMATCH'],
    [{ ...goodZone, status: 'pending' }, 'CLOUDFLARE_ZONE_INACTIVE'], [{ ...goodZone, type: 'partial' }, 'CLOUDFLARE_ZONE_INACTIVE'],
  ]) await assert.rejects(resolveZone({ api: zoneApi(zone), domain: 'example.com' }), refusedWith(code), JSON.stringify(zone));
});

test('resolveZone: no listed zone of that name (or no id) is CLOUDFLARE_ZONE_REQUIRED; an explicit zoneId skips the list', async () => {
  for (const zones of [[], [{ id: 'z1', name: 'example.org' }], [{ name: 'example.com' }]]) {
    await assert.rejects(resolveZone({ api: zoneApi(goodZone, { zones }), domain: 'example.com' }), refusedWith('CLOUDFLARE_ZONE_REQUIRED'));
  }
  const api = zoneApi(goodZone);
  assert.deepEqual(await resolveZone({ api, domain: 'example.com', zoneId: 'given' }), { id: 'given', name: 'example.com' });
  assert.deepEqual(api.calls, [['request', '/zones/given']]);
  const listed = zoneApi(goodZone, { zones: [{ id: 'zA', name: 'a.com' }, { id: 'z1', name: 'example.com' }] });
  await resolveZone({ api: listed, domain: 'example.com' });
  assert.deepEqual(listed.calls, [['list', '/zones?account.id=acct'], ['request', '/zones/z1']]);
});

const plan = { targetId: 'cloudflare-workers', resourceName: 'svc', zone: { id: 'zone' }, hostnames: [{ hostname: 'example.com' }] };
const proof = { path: '/p', expected: 'digest' };
const binding = { hostname: 'example.com', service: 'svc', environment: 'production' };
function workersApi({ bindings, certificates }) {
  return { kit, accountPath: '/accounts/acct', async list() { return bindings; }, async request() { return certificates; } };
}
const okKit = { ...kit, sleep: async () => {}, probeContent: async () => true };

test('Workers: each binding field and the certificate are required on their own', async () => {
  const cert = [{ status: 'active', hosts: ['example.com'] }];
  const cases = [
    [[binding], cert, 'ready', 'active', 'active'],
    [[{ ...binding, enabled: true }], cert, 'ready', 'active', 'active'],
    [[{ ...binding, enabled: false }], cert, 'pending', 'pending', 'active'],
    [[{ ...binding, hostname: 'www.example.com' }], cert, 'pending', 'pending', 'active'],
    [[{ ...binding, service: 'other' }], cert, 'pending', 'pending', 'active'],
    [[{ ...binding, environment: 'staging' }], cert, 'pending', 'pending', 'active'],
    [[{ ...binding, service: 'other' }, binding], cert, 'ready', 'active', 'active'],
    [[binding], [{ status: 'pending', hosts: ['example.com'] }], 'pending', 'active', 'pending'],
    [[binding], [{ status: 'active', hosts: ['other.com'] }], 'pending', 'active', 'pending'],
    [[binding], [{ status: 'active' }], 'pending', 'active', 'pending'],
    [[binding], { not: 'an array' }, 'pending', 'active', 'pending'],
  ];
  for (const [bindings, certificates, status, domainStatus, certificateStatus] of cases) {
    const [state] = await pollDomains({ api: workersApi({ bindings, certificates }), kit: okKit, plan, proof }, { attempts: 1 });
    assert.deepEqual([state.status, state.domainStatus, state.certificateStatus, state.contentVerified], [status, domainStatus, certificateStatus, status === 'ready'], JSON.stringify([bindings, certificates]));
  }
});

test('a wildcard certificate covers exactly one label below its base, never the apex or two levels down', async () => {
  for (const [hostname, covered] of [['www.example.com', true], ['example.com', false], ['a.b.example.com', false], ['www.example.org', false], ['wwwexample.com', false]]) {
    const api = workersApi({ bindings: [{ ...binding, hostname }], certificates: [{ status: 'active', hosts: ['*.example.com'] }] });
    const [state] = await pollDomains({ api, kit: okKit, plan: { ...plan, hostnames: [{ hostname }] }, proof }, { attempts: 1 });
    assert.equal(state.certificateStatus, covered ? 'active' : 'pending', hostname);
  }
});

test('polling backs off 1s, 2s, 4s, 8s, then stays at 8s, never sleeps after the last round, and stops when all are ready', async () => {
  const sleeps = [];
  const pending = { ...kit, sleep: async (ms) => { sleeps.push(ms); }, probeContent: async () => false };
  const pagesApi = { kit, accountPath: '/accounts/acct', async request() { return { status: 'active' }; } };
  const pagesPlan = { targetId: 'cloudflare-pages', resourceName: 'p', hostnames: [{ hostname: 'example.com' }] };
  await pollDomains({ api: pagesApi, kit: pending, plan: pagesPlan, proof }, { attempts: 6 });
  assert.deepEqual(sleeps, [1000, 2000, 4000, 8000, 8000]);
  sleeps.length = 0;
  let round = 0;
  const readyOnSecond = { ...pending, probeContent: async () => (round += 1) >= 2 };
  const states = await pollDomains({ api: pagesApi, kit: readyOnSecond, plan: pagesPlan, proof });
  assert.deepEqual([states[0].status, sleeps], ['ready', [1000]]);
});

test('a probe that throws becomes an unknown state carrying its code (or the default) and a next step', async () => {
  const pagesPlan = { targetId: 'cloudflare-pages', resourceName: 'p', hostnames: [{ hostname: 'example.com' }] };
  for (const [thrown, code] of [[Object.assign(new Error('denied.'), { code: 'CLOUDFLARE_FORBIDDEN' }), 'CLOUDFLARE_FORBIDDEN'], [new Error('boom.'), 'CLOUDFLARE_DOMAIN_STATUS_UNKNOWN']]) {
    const api = { kit, accountPath: '/a', async request() { throw thrown; } };
    const [state] = await pollDomains({ api, kit: okKit, plan: pagesPlan, proof }, { attempts: 1 });
    assert.deepEqual(state, { hostname: 'example.com', status: 'unknown', certificateStatus: 'unknown', contentVerified: false, errorCode: code,
      message: `example.com: ${thrown.message} Check domain validation and read permissions in Cloudflare, then preview again.` });
  }
});
