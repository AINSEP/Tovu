import assert from 'node:assert/strict';
import test from 'node:test';
import { projectDbPath, projectKeyFilePath } from '../project-store.js';

test('desktop and localhost share one app-data owner store regardless of sites root', () => {
  const home = '/tmp/p25-isolated-home';
  const appDataDir = '/tmp/p25-isolated-home/profile';
  assert.equal(projectDbPath({ home, projectId: 'root-a', appDataDir }), `${appDataDir}/project.db`);
  assert.equal(projectDbPath({ home, projectId: 'root-b', appDataDir }), `${appDataDir}/project.db`);
  assert.equal(projectKeyFilePath({ home, projectId: 'root-a', appDataDir }), `${appDataDir}/project-key.hex`);
});

test('an explicitly configured localhost profile remains available in production mode', async () => {
  const { localOwnerStoreEnabled } = await import('../project-store.js');
  assert.equal(localOwnerStoreEnabled({ runtimeMode: 'production', env: { TOVU_DESKTOP_USER_DATA_DIR: '/tmp/profile' } }), true);
  assert.equal(localOwnerStoreEnabled({ runtimeMode: 'production', env: {} }), false);
  assert.equal(localOwnerStoreEnabled({ runtimeMode: 'local', env: {} }), true);
});
