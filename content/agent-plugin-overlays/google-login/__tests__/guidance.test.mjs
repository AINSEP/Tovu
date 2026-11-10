import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The google-login skill in @jini-ai/agent-plugins is host-neutral; Tovu's own steps (callback
// route, workspace-id encoding, first-link proof, unlink rules) ship from this overlay, which
// Tovu places before the neutral skill. These pins are the ones the Jini test no longer carries.
const guidance = readFileSync(new URL('../GUIDANCE.md', import.meta.url), 'utf8');
const section = heading => guidance.split(`\n## ${heading}\n`)[1]?.split('\n## ')[0] ?? '';

test('Tovu members guidance preserves configured base paths, requires first-link proof and explains unlink', () => {
  const members = section('Tovu members');
  assert.match(members, /configured canonical address/);
  assert.match(members, /const callback = new URL\(configuredSiteAddress\)/);
  assert.match(members, /encodeURIComponent\(workspaceId\)/);
  assert.match(members, /target: "google-login-oauth-client"/);
  assert.match(members, /@gmail\.com.*@googlemail\.com/);
  assert.match(members, /Workspace accounts with an `hd` claim/);
  assert.match(members, /one emailed code/);
  assert.match(members, /issuer \+ subject, even if email changes/);
  assert.match(members, /Unlink must remain effective on the next Google sign-in/);
  assert.match(members, /Connect Google.*signed-in `\/account`/);
});

test('the Supabase branch names Tovu members and Tovu\'s callback', () => {
  const branch = section('Google via Supabase Auth');
  assert.match(branch, /card is unnecessary unless this site also uses Tovu members/);
  assert.match(branch, /both the Supabase callback and Tovu's callback/);
});

test('the overlay is one copy: each heading and the embed block appear once', () => {
  const headings = guidance.split('\n').filter(line => line.startsWith('## '));
  assert.deepEqual(headings, [...new Set(headings)]);
  assert.equal(guidance.split('<div data-embed-config=').length - 1, 1);
});
