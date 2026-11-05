import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeAttachments } from '#src/features/project-keys/__tests__/helpers';
import { withAttachedProject, withUnavailableProject, type ProviderConfigSource } from '../provider-config-source.js';

const keyId = 'plugin-state:example:provider.config';
function source(scope: 'site' | 'project'): ProviderConfigSource {
  return { scope, read: async () => ({ settings: {}, secrets: { token: `${scope}-fixture` } }),
    readSettings: async () => ({ settings: {}, secretNames: ['token'] }),
    usage: async () => ({ keyId, store: scope, usedByThisSite: scope === 'site', usedBy: [] }),
    write: async () => ({ keyId, store: scope, usedByThisSite: true, usedBy: [] }) };
}

test('local provider keys survive revocation and owner-store outages', async () => {
  const attachments = fakeAttachments();
  await attachments.attach({ siteId: 'a', siteName: 'A', keyId });
  const view = withAttachedProject({ site: source('site') }, { project: source('project'), attachments, siteId: 'a' });
  assert.equal((await view.read({ pluginId: 'example' }))?.secrets.token, 'site-fixture');
  await attachments.detach({ siteId: 'a', keyId });
  assert.equal((await view.read({ pluginId: 'example' }))?.secrets.token, 'site-fixture');
  assert.equal((await withUnavailableProject({ site: source('site'), reason: 'owner unavailable' }).read({ pluginId: 'example' }))?.secrets.token, 'site-fixture');
});

function emptySite(): ProviderConfigSource {
  return { ...source('site'), read: async () => null, readSettings: async () => null,
    usage: async () => ({ store: 'site', usedByThisSite: false, usedBy: [] }) };
}

test('revocation during a provider read discards the opened config', async () => {
  const attachments = fakeAttachments();
  await attachments.attach({ siteId: 'a', siteName: 'A', keyId });
  const project = source('project');
  project.read = async () => {
    await attachments.detach({ siteId: 'a', keyId });
    return { settings: {}, secrets: { token: 'fixture' } };
  };
  const view = withAttachedProject({ site: emptySite() }, { project, attachments, siteId: 'a' });
  assert.equal(await view.read({ pluginId: 'example' }), null);
});


test('a granted provider settings card cannot replace the shared owner key', async () => {
  const attachments = fakeAttachments();
  await attachments.attach({ siteId: 'a', siteName: 'A', keyId });
  const project = source('project');
  let writes = 0;
  project.write = async () => { writes++; };
  const view = withAttachedProject({ site: emptySite() }, { project, attachments, siteId: 'a' });
  await assert.rejects(view.write({ pluginId: 'example', config: { settings: {}, secrets: { token: 'different-fixture' } } }), /Shared Keys/);
  await view.write({ pluginId: 'example', config: { settings: {}, secrets: { token: 'project-fixture' } } });
  assert.equal(writes, 0, 'an unchanged save is a no-op, never an owner mutation');
});


test('a shared read failure is unconfigured, never a boot refusal', async () => {
  const attachments = fakeAttachments();
  await attachments.attach({ siteId: 'a', siteName: 'A', keyId });
  const project = source('project');
  project.read = async () => { throw Object.assign(new Error('private fixture'), { code: 'SQLITE_BUSY' }); };
  const view = withAttachedProject({ site: emptySite() }, { project, attachments, siteId: 'a' });
  assert.equal(await view.read({ pluginId: 'example' }), null);
});
