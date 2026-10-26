/** F9 (Stryker L15 site-scan-policy 72 %, keyed-serializer 50 %): every broad-root pattern with a
 * look-alike on each side of each anchor (AP4), the home and `$HOME/Tovu` cases, and the keyed queue's
 * slot-clearing rule (a call queued behind a running one must still wait for it). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSpecificSiteRoot } from './site-scan-policy.ts';
import { createKeyedSerializer } from './keyed-serializer.ts';

const HOME = '/home/u';
const broad = (root: string, sitesHome?: string) => assert.throws(() => assertSpecificSiteRoot({ root }, { homeDir: HOME, sitesHome }),
  { message: `Sites folder is too broad: ${root}. Choose a specific folder containing your Tovu websites.` }, root);
const allowed = (root: string, sitesHome?: string) => assert.doesNotThrow(() => assertSpecificSiteRoot({ root }, { homeDir: HOME, sitesHome }), root);

test('broad roots are refused: filesystem/home roots, a direct home child, user/volume/drive/UNC roots', () => {
  for (const root of ['/', '~', HOME, `${HOME}/`, `${HOME}/projects`, '~/x', '/Users', '/Users/bob', '/Users/bob/', '/home', '/home/bob',
    'C:', 'c:', 'C:\\', '//server', '//server/share', '//server/share/', '/Volumes', '/Volumes/Disk', '/mnt', '/mnt/x', '/media', '/media/usb', '/home/u/../u']) broad(root);
});

test('specific folders are allowed, including look-alikes on either side of every anchor', () => {
  for (const root of [`${HOME}/projects/sites`, '~/x/y', '/Users/bob/sites', '/home/bob/sites', '/x/Users', '/x/home/bob', '/Usersx', '/homes/x',
    'C:/sites', 'xc:', 'c:x', '//server/share/sites', '/Volumes/Disk/sites', '/mnt/x/y', '/srv/media', '/srv/sites', 'a~/x']) allowed(root);
});

test('$HOME/Tovu is allowed only when the sites home is exactly its sites/ folder', () => {
  allowed(`${HOME}/Tovu`, `${HOME}/Tovu/sites`);
  allowed(`${HOME}/Tovu/`, `${HOME}/Tovu/sites/`);
  broad(`${HOME}/Tovu`);
  broad(`${HOME}/Tovu`, `${HOME}/Tovu/other`);
  broad(`${HOME}/Tovu`, `${HOME}/sites`);
  broad(`${HOME}/Other`, `${HOME}/Other/sites`);
});

test('keyed serializer: same key runs in order even when a call is queued behind a still-running one', async () => {
  const queue = createKeyedSerializer();
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = queue.run('k', () => { order.push('1'); });
  const second = queue.run('k', async () => { await gate; order.push('2'); });
  await first;
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  // The first call's slot cleanup must NOT drop the still-running second call from the chain.
  const third = queue.run('k', () => { order.push('3'); });
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  assert.deepEqual(order, ['1']);
  release();
  await Promise.all([second, third]);
  assert.deepEqual(order, ['1', '2', '3']);
});

test('keyed serializer: a rejection reaches its own caller only; the next call on that key still runs; keys are independent', async () => {
  const queue = createKeyedSerializer();
  await assert.rejects(queue.run('k', () => { throw new Error('first failed'); }), { message: 'first failed' });
  assert.equal(await queue.run('k', () => 'after'), 'after');
  let release!: () => void;
  const blocked = queue.run('a', () => new Promise<string>(resolve => { release = () => resolve('a'); }));
  assert.equal(await queue.run('b', () => 'b'), 'b');
  release();
  assert.equal(await blocked, 'a');
});
