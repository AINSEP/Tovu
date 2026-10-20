/**
 * @file Drive helpers shared by every Google Workspace product. Today: who the connection is signed
 * in as. File metadata and whole-file copy (`files.get`, `files.copy`) join here when the Sheets
 * tools and the Picker need them.
 *
 * Exists so identity costs no extra permission: Drive `about.get` answers under `drive.file`, so
 * the sign-in never adds `openid`, `email` or `profile` scopes just to learn the account.
 * `permissionId` is the account's stable Drive id; the email is only for display.
 */
import { GoogleWorkspaceError } from './request-policy.mjs';

export const DRIVE_ABOUT_URL = 'https://www.googleapis.com/drive/v3/about';

/**
 * The signed-in account: `{ accountId, displayName }`.
 * @param {{ client: { request(input: object, options?: object): Promise<unknown> }, connectionRef: string }} required
 * @param {{ signal?: AbortSignal }} [optional]
 * @throws {GoogleWorkspaceError} `unexpected-response` when Google's answer names no account.
 * @complexity O(1): one request.
 */
export async function readAccount(required, optional = {}) {
  const body = await required.client.request({
    connectionRef: required.connectionRef, url: DRIVE_ABOUT_URL, kind: 'read',
    query: { fields: 'user(displayName,emailAddress,permissionId)' },
  }, optional);
  const user = body?.user;
  if (typeof user?.permissionId !== 'string' || user.permissionId === '') throw new GoogleWorkspaceError({ code: 'unexpected-response' });
  const label = [user.emailAddress, user.displayName].find((value) => typeof value === 'string' && value !== '');
  return { accountId: user.permissionId, displayName: label ?? 'Google account' };
}
