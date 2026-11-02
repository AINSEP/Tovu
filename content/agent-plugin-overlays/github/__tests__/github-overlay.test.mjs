import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * @file Tovu's overlay for the portable `github` plugin (now `@jini-ai/agent-plugins/github`). The plugin
 * dispatches `inputs.expected_sha` (pinned by its own Jini tests) but no longer explains it; this
 * overlay does, along with Tovu's Site key start commands and the missing restore tool (plan v2
 * §5.1). These pins tie that prose to the Tovu files it describes, so a renamed workflow input or
 * npm script fails here instead of in an operator's deploy or recovery.
 */

const overlayRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(overlayRoot, '../../..');
const guidance = () => readFile(path.join(overlayRoot, 'GUIDANCE.md'), 'utf8');

test("the workflow input the overlay names is the deploy workflow's required dispatch input", async () => {
  const workflow = await readFile(path.join(repoRoot, '.github/workflows/fly-deploy.yml'), 'utf8');
  const inputs = workflow.split('workflow_dispatch:')[1]?.split('\npermissions:')[0] ?? '';
  assert.match(inputs, /\n {6}expected_sha:\n(?: {8}.*\n)*? {8}required: true\n/);
  assert.match(workflow, /"\$EXPECTED_SHA" != "\$RESOLVED_SHA"/);
  const text = (await guidance()).replace(/\s+/g, ' ');
  assert.match(text, /`deployment_ops_deploy` with platform `github-actions`/);
  assert.match(text, /with `expected_sha` pinned to it\. The workflow refuses to deploy if that ref moved/);
});

test('the Site key start commands the overlay gives are real npm scripts', async () => {
  const { scripts } = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(typeof scripts.dev, 'string');
  assert.equal(typeof scripts.desktop, 'string');
  const text = await guidance();
  assert.match(text, /`CREDENTIAL_UNREADABLE`/);
  assert.match(text, /`npm run dev` from the repo root, or `npm run desktop`/);
  assert.match(text, /\*\*Secrets → Site key\*\*/);
});

test('the overlay keeps the no-restore promise and the export note', async () => {
  const text = await guidance();
  assert.match(text, /Tovu has no restore tool yet\. Do not promise one\./);
  assert.match(text, /`tovu export`/);
});

test('the overlay is vendor-neutral about models: no model or vendor names', async () => {
  assert.doesNotMatch(await guidance(), /\b(Claude|Anthropic|Codex|OpenAI|GPT|Gemini|Copilot)\b/);
});
