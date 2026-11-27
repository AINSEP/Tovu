import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createLivePreviewGuests, isLivePreviewGuestAllowed } from './site-preview-guests.ts';

function harness() {
  let url = 'http://127.0.0.1:8123/admin';
  let loading = false;
  const events = new EventEmitter();
  const scheduled: string[] = [];
  const cancelled: string[] = [];
  const shellUrl = 'file:///sites.html';
  const partitionSession = {};
  const owner = { isDestroyed: () => false, webContents: { getURL: () => shellUrl } };
  const guest = Object.assign(events, {
    hostWebContents: owner.webContents, session: partitionSession,
    isDestroyed: () => false, isLoading: () => loading, getURL: () => url,
    capturePage: async () => ({ resize: () => ({ toPNG: () => Buffer.from('png') }) }),
  });
  const guests = createLivePreviewGuests<typeof owner, typeof guest>({
    resolve: () => ({ siteDir: '/site', port: 8123, partition: 'persist:site' }),
    allowed: ({ owner, guest }) => isLivePreviewGuestAllowed({ owner, guest, shellUrl, partitionSession }),
    schedule: ({ siteDir }) => scheduled.push(siteDir),
    cancel: ({ siteDir }) => cancelled.push(siteDir),
  });
  return { guests, guest, owner, scheduled, cancelled,
    url: (next: string) => { url = next; },
    loading: (value: boolean) => { loading = value; },
  };
}

test('only ready public visits schedule thumbnails and a later visit can refresh', () => {
  const h = harness();
  const off = h.guests.register({ owner: h.owner, guest: h.guest });
  h.guest.emit('did-finish-load');
  assert.deepEqual(h.scheduled, []);
  h.url('http://127.0.0.1:8123/about');
  h.guest.emit('did-finish-load');
  assert.deepEqual(h.scheduled, ['/site']);
  const first = h.guests.liveGuest({ siteDir: '/site' })!;
  assert.equal(first.isCurrent(), true);
  h.guest.emit('did-start-navigation');
  assert.equal(first.isCurrent(), false);
  h.url('http://127.0.0.1:8123/contact');
  h.guest.emit('did-navigate-in-page');
  assert.deepEqual(h.scheduled, ['/site', '/site']);
  off();
  assert.equal(h.guests.liveGuest({ siteDir: '/site' }), undefined);
  assert.equal(h.guest.listenerCount('did-finish-load'), 0);
});

test('foreign shell wrong partition and loading guests cannot be captured', () => {
  const h = harness();
  h.url('http://127.0.0.1:8123/');
  h.guests.register({ owner: { isDestroyed: () => false, webContents: { getURL: () => 'file:///foreign.html' } }, guest: h.guest });
  h.guest.emit('did-finish-load');
  assert.equal(h.guests.liveGuest({ siteDir: '/site' }), undefined);
  h.guest.emit('destroyed');
  h.guests.register({ owner: h.owner, guest: h.guest });
  const correctSession = h.guest.session;
  h.guest.session = {};
  h.guest.emit('did-finish-load');
  assert.equal(h.guests.liveGuest({ siteDir: '/site' }), undefined);
  h.guest.session = correctSession;
  h.loading(true);
  h.guest.emit('did-finish-load');
  assert.deepEqual(h.scheduled, []);
});

test('destroyed guests cancel pending captures without detaching another instance', () => {
  const a = harness();
  const b = harness();
  for (const h of [a, b]) {
    h.url('http://127.0.0.1:8123/');
    h.guests.register({ owner: h.owner, guest: h.guest });
    h.guest.emit('did-finish-load');
  }
  const snapshot = a.guests.liveGuest({ siteDir: '/site' })!;
  a.guest.emit('destroyed');
  assert.equal(snapshot.isCurrent(), false);
  assert.ok(b.guests.liveGuest({ siteDir: '/site' }));
  assert.ok(a.cancelled.includes('/site'));
});

test('a replacement guest invalidates an older capture of the same canonical site', () => {
  const h = harness();
  h.url('http://127.0.0.1:8123/');
  h.guests.register({ owner: h.owner, guest: h.guest });
  h.guest.emit('did-finish-load');
  const previous = h.guests.liveGuest({ siteDir: '/site' })!;
  const otherEvents = new EventEmitter();
  const other = Object.assign(otherEvents, {
    hostWebContents: h.owner.webContents, session: h.guest.session,
    getURL: h.guest.getURL, isDestroyed: () => false, isLoading: () => false,
    capturePage: h.guest.capturePage,
  });
  h.guests.register({ owner: h.owner, guest: other });
  other.emit('did-finish-load');
  assert.equal(previous.isCurrent(), false);
});

test('preview eligibility checks shell URL, owner, host webContents and actual partition session identity', () => {
  const shellUrl = 'file:///sites.html';
  const partitionSession = {};
  const webContents = { getURL: () => shellUrl };
  const owner = { isDestroyed: () => false, webContents };
  const guest = { hostWebContents: webContents, session: partitionSession };
  const input = { owner, guest, shellUrl, partitionSession };
  assert.equal(isLivePreviewGuestAllowed(input), true);
  assert.equal(isLivePreviewGuestAllowed({ ...input, partitionSession: {} }), false);
  assert.equal(isLivePreviewGuestAllowed({ ...input, guest: { ...guest, hostWebContents: { getURL: () => shellUrl } } }), false);
  assert.equal(isLivePreviewGuestAllowed({ ...input, owner: { ...owner, isDestroyed: () => true } }), false);
  assert.equal(isLivePreviewGuestAllowed({ ...input, owner: { ...owner, webContents: { getURL: () => 'file:///foreign.html' } } }), false);
});

test('an eligible HTTPS guest exposes its live URL and delegates each capture to that guest', async () => {
  const target = { siteDir: '/sites/store', port: 5443, partition: 'persist:store', scheme: 'https' as const };
  const owner = { isDestroyed: () => false };
  let url = 'https://localhost:5443/catalog';
  const page = { resize: () => ({ toPNG: () => Buffer.from('store preview') }) };
  let captures = 0;
  const guest = Object.assign(new EventEmitter(), {
    getURL: () => url, isDestroyed: () => false, isLoading: () => false,
    capturePage: async () => { captures++; return page; },
  });
  const scheduled: { siteDir: string }[] = [];
  const guests = createLivePreviewGuests<typeof owner, typeof guest>({
    resolve: ({ url: requested }) => new URL(requested).pathname.startsWith('/catalog') ? target : undefined,
    allowed: (input) => input.owner === owner && input.guest === guest && input.target === target,
    schedule: (input) => scheduled.push(input),
    cancel: () => {},
  });
  const off = guests.register({ owner, guest });
  try {
    guest.emit('did-finish-load');
    assert.deepEqual(scheduled, [{ siteDir: '/sites/store' }]);
    const preview = guests.liveGuest({ siteDir: '/sites/store' });
    assert.ok(preview);
    assert.equal(preview.partition, 'persist:store');
    assert.equal(preview.getURL(), 'https://localhost:5443/catalog');
    url = 'https://localhost:5443/catalog/item';
    assert.equal(preview.getURL(), url);
    assert.equal(preview.isCurrent(), true);
    assert.equal(await preview.capturePage(), page);
    assert.equal(await preview.capturePage(), page);
    assert.equal(captures, 2);
    url = 'https://localhost:5443/unregistered';
    assert.equal(preview.isCurrent(), false);
    assert.equal(guests.liveGuest({ siteDir: '/sites/store' }), undefined);
  } finally {
    off();
  }
});
