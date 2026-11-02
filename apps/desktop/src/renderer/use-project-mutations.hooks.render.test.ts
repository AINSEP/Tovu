/**
 * @file `useProjectMutations` rendered from its real module under jsdom, with the bridge lookup
 * injected and the other hooks' collaborators as spies. Moved from `App.hooks.render.test.ts` with
 * the split, including T18 (which also renders the real `useSitesPolling` it races against).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act, useState, type Dispatch, type SetStateAction } from 'react';
import type { CreatedSiteRecord, CreateSiteInput, SiteRecord } from '../contracts/project.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { deferred, renderHookWithView as renderHook, settle, site, type TestContext } from './app-hooks.test-support.js';
import { useProjectMutations } from './use-project-mutations.hooks.js';
import { useSitesPolling } from './use-sites-inventory.hooks.js';

function useProjectsWith<T>(initial: readonly SiteRecord[], useRest: (setProjects: Dispatch<SetStateAction<readonly SiteRecord[]>>, projects: readonly SiteRecord[]) => T) {
  const [projects, setProjects] = useState<readonly SiteRecord[]>(initial);
  return { projects, ...useRest(setProjects, projects) };
}

function mutationsHarness(t: TestContext, bridge: Pick<RunnerInventoryBridge, 'createSite' | 'deleteSite'> | undefined) {
  const calls: string[] = [];
  const getBridge = () => bridge;
  const hook = renderHook(t, () => useProjectsWith([site('a'), site('b')], (setProjects, projects) => useProjectMutations({
    setProjects, projects,
    closeProjectTab: (id) => calls.push(`close:${id}`),
    stopCreating: () => calls.push('stop'),
    startCreating: () => calls.push('start'),
  }, { getBridge })));
  return { hook, calls };
}

const CREATED: CreatedSiteRecord = { ...site('new'), agentPluginTokens: { status: 'saved', pluginIds: ['x'] } };
const INPUT: CreateSiteInput = { displayName: 'new', database: { kind: 'sqlite' } };

test('T18: a poll started before creation cannot erase the new site and its token notice', async (t) => {
  const stalePoll = deferred<readonly SiteRecord[]>();
  const pendingCreate = deferred<CreatedSiteRecord>();
  const responses = [Promise.resolve([site('a')]), stalePoll.promise];
  const bridge = {
    listSites: () => responses.shift()!,
    createSite: () => pendingCreate.promise,
    deleteSite: async () => {},
  };
  const getBridge = () => bridge;
  let tick!: () => void;
  let stopped = 0;
  const startInterval = (callback: () => void) => { tick = callback; return () => { stopped++; }; };
  const hook = renderHook(t, () => {
    const polling = useSitesPolling({}, { getBridge, startInterval });
    const mutations = useProjectMutations({
      projects: polling.projects, setProjects: polling.setProjects,
      closeProjectTab: () => {}, startCreating: () => {}, stopCreating: () => {},
    }, { getBridge });
    return { ...polling, ...mutations };
  });
  await settle();
  assert.deepEqual(hook.current().projects.map(project => project.id), ['a']);
  act(() => tick()); // The snapshot taken before creation is still in flight.
  let creating!: Promise<void>;
  act(() => { creating = hook.current().handleCreate(INPUT); });
  await act(async () => { pendingCreate.resolve(CREATED); await creating; });
  assert.equal(hook.current().lastCreated, CREATED, 'the successful create exposes its token outcome');

  await act(async () => { stalePoll.resolve([site('a')]); });
  await settle();
  const actual = { ids: hook.current().projects.map(project => project.id), notice: hook.current().lastCreated };
  hook.unmount();
  assert.equal(stopped, 1, 'unmount releases the polling interval');
  assert.deepEqual(actual, { ids: ['a', 'new'], notice: CREATED },
    'an older inventory snapshot must preserve the newly created site and its one-time token notice');
});

test('useProjectMutations: a create appends the plain record, keeps the full result for the notice, and resets the form', async (t) => {
  const inputs: CreateSiteInput[] = [];
  const { hook, calls } = mutationsHarness(t, { createSite: async (input) => { inputs.push(input); return CREATED; }, deleteSite: async () => {} });
  const key = hook.current().createFormKey;
  await act(() => hook.current().handleCreate(INPUT));
  assert.deepEqual(inputs, [INPUT]);
  assert.deepEqual(hook.current().projects.at(-1), site('new'), 'the token outcome stays off the grid row');
  assert.equal(hook.current().lastCreated, CREATED);
  assert.deepEqual(calls, ['stop']);
  assert.equal(hook.current().createFormKey, key + 1);
});

test('useProjectMutations: a cancelled picker keeps the form, and a missing bridge throws before touching anything', async (t) => {
  const { hook, calls } = mutationsHarness(t, { createSite: async () => null, deleteSite: async () => {} });
  const key = hook.current().createFormKey;
  await act(() => hook.current().handleCreate(INPUT));
  assert.deepEqual({ calls, key: hook.current().createFormKey, count: hook.current().projects.length }, { calls: [], key, count: 2 });

  const missing = mutationsHarness(t, undefined);
  await assert.rejects(missing.hook.current().handleCreate(INPUT), /Runner desktop connection required to create a website\./);
  await assert.rejects(missing.hook.current().handleDelete('a'), /Runner desktop connection required to delete a website\./);
  assert.deepEqual(missing.calls, []);
  assert.equal(missing.hook.current().projects.length, 2);
});

test('useProjectMutations: a rejected create or delete propagates and leaves the grid, tabs and form as they were', async (t) => {
  const { hook, calls } = mutationsHarness(t, {
    createSite: () => Promise.reject(new Error('folder exists')),
    deleteSite: () => Promise.reject(new Error('folder is locked')),
  });
  const key = hook.current().createFormKey;
  await assert.rejects(hook.current().handleCreate(INPUT), /folder exists/);
  await assert.rejects(hook.current().handleDelete('a'), /folder is locked/);
  assert.deepEqual({ calls, key: hook.current().createFormKey, ids: hook.current().projects.map((p) => p.id), notice: hook.current().lastCreated },
    { calls: [], key, ids: ['a', 'b'], notice: null });
});

test('useProjectMutations: delete drops the row and its tab; open clears the notice first; cancel resets the form', async (t) => {
  const deleted: string[] = [];
  const { hook, calls } = mutationsHarness(t, { createSite: async () => CREATED, deleteSite: async (id) => { deleted.push(id); } });
  await act(() => hook.current().handleDelete('a'));
  assert.deepEqual(deleted, ['a']);
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['b']);
  assert.deepEqual(calls.splice(0), ['close:a']);

  await act(() => hook.current().handleCreate(INPUT));
  assert.equal(hook.current().lastCreated, CREATED);
  calls.length = 0;
  const key = hook.current().createFormKey;
  act(() => hook.current().openCreateWebsite());
  assert.equal(hook.current().lastCreated, null);
  assert.equal(hook.current().createFormKey, key + 1);
  assert.deepEqual(calls.splice(0), ['start']);
  act(() => hook.current().cancelCreate());
  assert.equal(hook.current().createFormKey, key + 2);
  assert.deepEqual(calls, ['stop']);
});

test('useProjectMutations: the ready notice is withdrawn once the site it names leaves the grid', async (t) => {
  const { hook } = mutationsHarness(t, { createSite: async () => CREATED, deleteSite: async () => {} });
  await act(() => hook.current().handleCreate(INPUT));
  assert.equal(hook.current().lastCreated, CREATED, 'still true: the new site is stopped and on the grid');
  await act(() => hook.current().handleDelete('new'));
  assert.equal(hook.current().lastCreated, null, 'the site it names is gone, so the notice goes too');
});

test('useProjectMutations: a caller that passes no project list never has the notice withdrawn under it', async (t) => {
  const getBridge = () => ({ createSite: async () => CREATED, deleteSite: async () => {} });
  const hook = renderHook(t, () => useProjectsWith([], (setProjects) => useProjectMutations({
    setProjects, closeProjectTab: () => {}, stopCreating: () => {}, startCreating: () => {},
  }, { getBridge })));
  await act(() => hook.current().handleCreate(INPUT));
  await act(() => hook.current().handleDelete('new'));
  assert.equal(hook.current().lastCreated, CREATED, 'without `projects` there is nothing to check the notice against');
});
