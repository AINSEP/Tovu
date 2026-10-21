import assert from 'node:assert/strict';
import test from 'node:test';
import { navigateSitePageAction } from '../site-page-actions';

for (const auto of [true, false]) test(`React ${auto ? 'automatic' : 'confirmed'} navigation authorizes before side effects`, () => {
  const calls: string[] = [];
  const navigate = (path: string) => navigateSitePageAction({
    action: { type: 'navigate', auto, target: { path, title: 'About', slug: 'about' } },
    beforeNavigate: () => calls.push('persist and enqueue'),
  }, { assign: ({ path }) => calls.push(path) });
  for (const path of ['//evil.test', '/\\evil.test', 'https://evil.test', 'javascript:alert(1)', '/\n/evil.test', '/ bad']) {
    assert.equal(navigate(path), false);
    assert.deepEqual(calls, []);
  }
  assert.equal(navigate('/about?view=full#intro'), true);
  assert.deepEqual(calls, ['persist and enqueue', '/about?view=full#intro']);
});

test('navigateSitePageAction assigns the page location by default', () => {
  const assigned: string[] = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { assign: (path: string) => assigned.push(path) } } });
  try {
    const order: string[] = [];
    const navigated = navigateSitePageAction({
      action: { type: 'navigate', target: { slug: 'about', title: 'About', path: '/about' }, auto: false },
      beforeNavigate: () => order.push('before'),
    });
    assert.equal(navigated, true);
    assert.deepEqual(order, ['before']);
    assert.deepEqual(assigned, ['/about']);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete (globalThis as { window?: unknown }).window;
  }
});
