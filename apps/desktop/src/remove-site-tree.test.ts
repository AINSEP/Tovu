import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSiteTreeWritable, removeSiteTree, type WritableTreePort } from './remove-site-tree.ts';

function filesFake() {
  const writes: [string, number][] = [];
  const files: WritableTreePort = {
    lstatSync: (entry) => ({ mode: entry.endsWith('package') ? 0o555 : 0o444,
      isDirectory: () => entry.endsWith('package'), isSymbolicLink: () => entry.endsWith('link') }),
    chmodSync: (entry, mode) => { writes.push([entry, mode]); },
    readdirSync: () => ['mcp.json', 'link'],
  };
  return { files, writes };
}
test('D-01: owner-write is added recursively before removing the immutable store, without following links', async () => {
  const { files, writes } = filesFake();
  await removeSiteTree({ root: '/site/package' }, { files, remove: async (root) => {
    assert.equal(root, '/site/package');
    assert.deepEqual(writes, [['/site/package', 0o755], ['/site/package/mcp.json', 0o644]]);
  } });
});
test('D-01: an absent tree is harmless, but permission failures propagate and prevent removal', async () => {
  const { files } = filesFake();
  files.lstatSync = () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); };
  makeSiteTreeWritable({ root: '/gone' }, { files });
  files.lstatSync = () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); };
  await assert.rejects(removeSiteTree({ root: '/site' }, { files, remove: async () => assert.fail('must not remove') }), { message: 'denied' });
});
