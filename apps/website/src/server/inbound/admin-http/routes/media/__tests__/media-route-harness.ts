import assert from 'node:assert/strict';
import type { Express } from 'express';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { BASE, fixture, type Deps, type Register } from '#src/server/__tests__/helpers/admin-route-failures';
import { registerAdminMediaUploadRoute } from '../upload.js';

/** Shared seeding for the media route branch tests: real in-memory composition deps, with the
 *  upload route mounted next to the route under test so assets are stored the way production does. */

/** A 1x1 transparent PNG — minimal valid bytes that pass the upload sniff and allowlist. */
export const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/** The exact 403 body every media route (except text) writes on denial. */
export function forbiddenBody(permission: string, reason = 'no_grant') {
  return { error: `principal 'owner' is not authorized for '${permission}' (${reason})`, code: 'FORBIDDEN', details: { permission, reason } };
}

/** Mounts `register` plus the upload route on the shared admin fixture. */
export function mediaApp(register: Register, overrides: Partial<Deps> = {}): { app: Express; deps: Deps } {
  return fixture((app, deps) => { registerAdminMediaUploadRoute(app, deps); register(app, deps); }, overrides);
}

/** Uploads the 1x1 PNG through the real upload route and returns the stored media id. */
export async function seedPng(app: Express, body: Record<string, unknown> = {}): Promise<string> {
  const uploaded = await dispatchJsonRequest(app, 'POST', `${BASE}/media`, { filename: 'pixel.png', contentType: 'image/png', dataBase64: PNG_BASE64, ...body });
  assert.equal(uploaded.status, 201);
  return (uploaded.body as { media: { id: string } }).media.id;
}
