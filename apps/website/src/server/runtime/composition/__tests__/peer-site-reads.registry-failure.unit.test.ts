import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolInputError } from '@jini-ai/core';
import type { SitesWorkspace } from '#src/platform/site-dir/sites-home';
import { createPeerSiteReads } from '../peer-site-reads.js';

/**
 * @file A registry that cannot be read is a server fault, not a mistake in the model's input. It
 * must reach the tool transport as an ordinary error carrying its cause, so the transport mints an
 * error ID, logs the redacted cause and shows Copy details. As a ToolInputError it told the model
 * its call was wrong and dropped the cause.
 */
test('an unreadable site registry is an incident with its cause, not a ToolInputError', () => {
  const cause = Object.assign(new Error('EACCES: permission denied, open sites.json'), { code: 'EACCES' });
  const workspace = { registry: () => ({ list: () => { throw cause; } }) } as unknown as SitesWorkspace;
  const port = createPeerSiteReads({ currentSiteDir: '/tmp/site-a' }, { workspace, localHost: true });
  assert.throws(() => port.isCurrentSite({ siteName: 'B' }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(!(error instanceof ToolInputError), 'a server fault must not be reported as bad tool input');
    assert.equal(error.message, 'The local site registry could not be read.');
    assert.equal(error.cause, cause);
    return true;
  });
});
