import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EntityNotLiveError } from '@jini-ai/cms/core';
import { InMemoryMenuRepo, InMemoryNavLocationBindingRepo, MenuConflictError, MenuNotFoundError, MenuVersionConflictError, type NavMenuEntry } from '#src/features/navigation/index';
import type { MenuRouteDeps } from '#src/server/inbound/admin-http/http/menus';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { BASE, WS, fixture } from '#src/server/__tests__/helpers/admin-route-failures';
import { registerAdminMenuAssignLocationRoute } from '../assign-location.js';

const path = `${BASE}/menus/menu/locations`;
const now = '2026-10-20T00:00:00.000Z';

for (const body of [undefined, null, {}, { locationKey: null }, { locationKey: '' }, { locationKey: ' \t ' }]) {
  test(`assign-location: rejects missing/blank key before authorization: ${JSON.stringify(body)}`, async () => {
    let calls = 0;
    const authorize: MenuRouteDeps['authorize'] = async () => { calls++; return { allowed: true, reason: 'matched' }; };
    const { app } = fixture(registerAdminMenuAssignLocationRoute, { authorize });
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', path, body), {
      status: 400, body: { error: 'locationKey is required' },
    });
    assert.equal(calls, 0);
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', path.replace(BASE, '/api/admin/v1/workspaces/other'), body), {
      status: 404, body: { error: 'workspace was not found' },
    });
    assert.equal(calls, 0);
  });
}

test('assign-location: denial uses the scoped permission and leaves the repository untouched', async () => {
  const inputs: Parameters<MenuRouteDeps['authorize']>[0][] = [];
  let reads = 0;
  const authorize: MenuRouteDeps['authorize'] = async (input) => {
    inputs.push(input);
    return { allowed: false, reason: 'no_grant' };
  };
  const { app, deps } = fixture(registerAdminMenuAssignLocationRoute, { authorize });
  deps.menuRepo.findById = async () => { reads++; return null; };
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', path, { locationKey: 'primary' }), {
    status: 403,
    body: {
      error: "principal 'owner' is not authorized for 'admin.menus.assign' (no_grant)",
      code: 'FORBIDDEN', details: { permission: 'admin.menus.assign', reason: 'no_grant' },
    },
  });
  assert.deepEqual(inputs, [{ principalId: 'owner', permission: 'admin.menus.assign', workspaceId: WS, entityType: 'menu', entityId: 'menu' }]);
  assert.equal(reads, 0);
});

const failures = [
  { error: new MenuNotFoundError({ message: 'missing menu' }), status: 404, body: { error: 'missing menu' } },
  { error: new MenuVersionConflictError({ message: 'stale menu' }), status: 409, body: { error: 'stale menu', code: 'VERSION_CONFLICT' } },
  { error: new MenuConflictError({ message: 'conflicting assignment' }), status: 409, body: { error: 'conflicting assignment' } },
  { error: new Error('private repository detail'), status: 500, body: { error: 'internal error' } },
];
for (const state of ['trashed', 'tombstoned'] as const) {
  const error = new EntityNotLiveError({ entityType: 'menu', entityId: 'menu', state });
  failures.push({ error, status: 409, body: { error: error.message, code: error.code } });
}
for (const { error, status, body } of failures) {
  test(`assign-location: preserves ${error.name} response (${JSON.stringify(body)})`, async () => {
    const { app, deps } = fixture(registerAdminMenuAssignLocationRoute);
    deps.menuRepo.findById = async () => { throw error; };
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', path, { locationKey: 'primary' }), { status, body });
  });
}

test('assign-location: authorization failures remain opaque', async () => {
  const authorize: MenuRouteDeps['authorize'] = async () => { throw new Error('private authorization detail'); };
  const { app } = fixture(registerAdminMenuAssignLocationRoute, { authorize });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', path, { locationKey: 'primary' }), {
    status: 500, body: { error: 'internal error' },
  });
});

for (const locationKey of [' primary ', 0, false]) {
  test(`assign-location: coerces and trims ${JSON.stringify(locationKey)} and serializes displacement`, async () => {
    // why: the injected Clock port is `{ nowMs }` (@jini-ai/core primitives/time); a `nowIso` stub throws inside assignLocation.
    const clock: MenuRouteDeps['clock'] = { nowMs: () => Date.parse(now), nowIso: () => now };
    const { app, deps } = fixture(registerAdminMenuAssignLocationRoute, {
      clock, menuRepo: new InMemoryMenuRepo({}), navLocationBindingRepo: new InMemoryNavLocationBindingRepo({}),
    });
    const key = String(locationKey).trim();
    const menu: NavMenuEntry = {
      id: 'menu', workspaceId: WS, title: 'Main', slug: 'main', status: 'draft',
      doc: { type: 'menu', version: 1, items: [] }, locations: [], updatedAt: now, version: 1,
    };
    await deps.menuRepo.save(menu);
    const assigned = await dispatchJsonRequest(app, 'POST', path, { locationKey });
    const expectedMenu = {
      id: 'menu', workspaceId: WS, title: 'Main', slug: 'main', status: 'draft',
      items: [], locations: [key], updatedAt: now, version: 2,
    };
    assert.deepEqual(assigned, {
      status: 200, body: { menu: expectedMenu, binding: { workspaceId: WS, menuId: 'menu', locationKey: key, boundAt: now }, displacedMenu: null },
    });
    await deps.menuRepo.save({ ...menu, id: 'replacement', slug: 'replacement' });
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', path.replace('/menus/menu/', '/menus/replacement/'), { locationKey }), {
      status: 200,
      body: {
        menu: { ...expectedMenu, id: 'replacement', slug: 'replacement' },
        binding: { workspaceId: WS, menuId: 'replacement', locationKey: key, boundAt: now },
        displacedMenu: { ...expectedMenu, locations: [], version: 3 },
      },
    });
    assert.deepEqual((await deps.menuRepo.findById({ workspaceId: WS, id: 'menu' }))?.locations, []);
    assert.deepEqual((await deps.menuRepo.findById({ workspaceId: WS, id: 'replacement' }))?.locations, [key]);
  });
}
