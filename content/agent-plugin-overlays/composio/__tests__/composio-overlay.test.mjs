import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { nativeToolMetadata } from '../../../../apps/website/src/contracts/core/tool-metadata/index.ts';

/**
 * @file Tovu's overlay for the portable `composio` plugin (now `@jini-ai/plugin-composio`). The
 * plugin says what to grant; this overlay holds where Tovu grants it, the restart and the
 * `TOVU_PUBLIC_URL` fallback (plan v2 §5.1).
 */

const readGuidance = () => readFile(path.resolve(import.meta.dirname, '../GUIDANCE.md'), 'utf8');

test('the Tovu sign-in fallback, grant screen and restart live here', async () => {
  const guidance = await readGuidance();
  assert.match(guidance, /`TOVU_PUBLIC_URL` is unset, send the user to \*\*Settings > External MCP\*\*/);
  assert.match(guidance, /second \*\*"may write"\*\* tick/);
  assert.match(guidance, /`COMPOSIO_MULTI_EXECUTE_TOOL` and\s+`COMPOSIO_MANAGE_CONNECTIONS`/);
  assert.match(guidance, /remote-declares-not-read-only/);
  assert.match(guidance, /\*\*Restart the assistant\*\*/);
});

test('the overlay grants no remote code-execution tool', async () => {
  assert.doesNotMatch(await readGuidance(), /COMPOSIO_REMOTE_WORKBENCH|COMPOSIO_REMOTE_BASH_TOOL/);
});

test('every snake_case tool the overlay cites is a served native tool or a per-plugin tool', async () => {
  const declared = new Set(Object.keys(nativeToolMetadata.byId));
  const cited = [...(await readGuidance()).matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?=`| \{|\()/g)].map(match => match[1]);
  assert.ok(cited.length > 0);
  assert.deepEqual(cited.filter(id => !declared.has(id) && !/^agent_plugin_[a-z0-9_]+$/.test(id)), []);
});
