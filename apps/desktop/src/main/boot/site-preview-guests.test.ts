import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createLivePreviewGuests } from './site-preview-guests.ts';

function harness() {
  let url = 'http://127.0.0.1:8123/admin';
  let trusted = true;
  let loading = false;
  const events = new EventEmitter();
  const scheduled: string[] = [];
  const cancelled: string[] = [];
  const owner = { isDestroyed: () => false };
  const guest = Object.assign(events, {
    isDestroyed: () => false, isLoading: () => loading, getURL: () => url,
    capturePage: async () => ({ resize: () => ({ toPNG: () => Buffer.from('png') }) }),
  });
  const guests = createLivePreviewGuests({
    resolve: () => ({ siteDir: '/site', port: 8123, partition: 'persist:site' }),
    allowed: ({ owner: shell }) => shell === owner && trusted,
    schedule: ({ siteDir }) => scheduled.push(siteDir),
    cancel: ({ siteDir }) => cancelled.push(siteDir),
  });
  return { guests, guest, owner, scheduled, cancelled,
    url: (next: string) => { url = next; }, trust: (value: boolean) => { trusted = value; },
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
  h.guests.register({ owner: { isDestroyed: () => false }, guest: h.guest });
  h.guest.emit('did-finish-load');
  assert.equal(h.guests.liveGuest({ siteDir: '/site' }), undefined);
  h.guest.emit('destroyed');
  h.guests.register({ owner: h.owner, guest: h.guest });
  h.trust(false);
  h.guest.emit('did-finish-load');
  assert.equal(h.guests.liveGuest({ siteDir: '/site' }), undefined);
  h.trust(true);
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
    getURL: h.guest.getURL, isDestroyed: () => false, isLoading: () => false,
    capturePage: h.guest.capturePage,
  });
  h.guests.register({ owner: h.owner, guest: other });
  other.emit('did-finish-load');
  assert.equal(previous.isCurrent(), false);
});
