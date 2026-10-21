import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerAdminMenuAssignLocationRoute } from '../assign-location.js';
import { registerAdminMenuCreateRoute } from '../create.js';
import { registerAdminMenuDeleteRoute } from '../delete.js';
import { registerAdminMenuGetRoute } from '../get-by-id.js';
import { registerAdminMenuListRoute } from '../list.js';
import { MenuConflictError, MenuVersionConflictError } from '#src/features/navigation/index';
import { WS, BASE, INTERNAL, fixture, testRouteFailureMatrix, type RouteFailureCase } from '#src/server/__tests__/helpers/admin-route-failures';

const routes: RouteFailureCase[] = [
  { name: 'menus assign', register: registerAdminMenuAssignLocationRoute, method: 'POST', path: `${BASE}/menus/menu/locations`, body: { locationKey: 'primary' } },
  { name: 'menus create', register: registerAdminMenuCreateRoute, method: 'POST', path: `${BASE}/menus` },
  { name: 'menus delete', register: registerAdminMenuDeleteRoute, method: 'DELETE', path: `${BASE}/menus/menu` },
  { name: 'menus get', register: registerAdminMenuGetRoute, method: 'GET', path: `${BASE}/menus/menu` },
  { name: 'menus list', register: registerAdminMenuListRoute, method: 'GET', path: `${BASE}/menus` },
];

testRouteFailureMatrix(routes);

test('menu get: lookup failure is private, missing slug falls back to the unnormalized id', async () => {
  const lookups: unknown[] = [];
  const { app } = fixture(registerAdminMenuGetRoute, { menuRepo: {
    findBySlug: async (input: unknown) => { lookups.push(input); return null; },
    findById: async (input: unknown) => { lookups.push(input); throw new Error('private storage details'); },
  } });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/menus/Menu-ID`), { status: 500, body: INTERNAL });
  assert.deepEqual(lookups, [{ workspaceId: WS, slug: 'menu-id' }, { workspaceId: WS, id: 'Menu-ID' }]);
});

for (const body of [{ items: {} }, { items: null }, { items: 'bad' }]) {
  test(`menu create: rejects malformed items ${JSON.stringify(body)} before repository writes`, async () => {
    let saves = 0;
    const { app } = fixture(registerAdminMenuCreateRoute, { menuRepo: { save: async () => { saves++; } } });
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/menus`, body), { status: 400, body: { error: 'items must be an array' } });
    assert.equal(saves, 0);
  });
}

test('menu create: duplicate slug is a conflict and does not write another menu', async () => {
  const { app, deps } = fixture(registerAdminMenuCreateRoute);
  const first = await dispatchJsonRequest(app, 'POST', `${BASE}/menus`, { title: 'Main', slug: 'main', items: [] });
  assert.equal(first.status, 201);
  const second = await dispatchJsonRequest(app, 'POST', `${BASE}/menus`, { title: 'Duplicate', slug: 'main' });
  assert.equal(second.status, 409);
  assert.match((second.body as { error: string }).error, /main/);
  assert.equal((await deps.menuRepo.list({ workspaceId: WS })).length, 1);
});

for (const [error, code] of [[new MenuConflictError({ message: 'assignment conflict' }), undefined], [new MenuVersionConflictError({ message: 'stale assignment' }), 'VERSION_CONFLICT']] as const) {
  test(`menu assign: domain conflict maps to 409 ${code ?? 'without code'}`, async () => {
    const { app } = fixture(registerAdminMenuAssignLocationRoute, { menuRepo: { findById: async () => { throw error; } } });
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/menus/menu/locations`, { locationKey: 'primary' }), {
      status: 409, body: { error: error.message, ...(code ? { code } : {}) },
    });
  });
}

test('menu delete: a row that changed between the read and the trash move is a 409 conflict, not a success', async () => {
  const removals: unknown[] = [];
  const { app } = fixture(registerAdminMenuDeleteRoute, {
    menuRepo: { findById: async () => ({ id: 'menu', workspaceId: WS, title: 'Main', slug: 'main', version: 3 }) },
    removeMenu: async (input: unknown) => { removals.push(input); return { ok: false, reason: 'version-changed' }; },
  });
  const result = await dispatchJsonRequest(app, 'DELETE', `${BASE}/menus/menu`);
  assert.equal(result.status, 409);
  assert.match((result.body as { error: string }).error, /menu 'menu' changed while it was being deleted/);
  assert.equal(removals.length, 1);
  assert.equal((removals[0] as { expectedVersion: number }).expectedVersion, 3);
});
