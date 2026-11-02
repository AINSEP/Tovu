import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { renderFromValues } from '@jini-ai/plugin-fly/fly/scripts/render-deploy-workflow.mjs';

/**
 * @file Tovu's overlay for the portable Fly plugin (`@jini-ai/plugin-fly`). Tovu's production
 * `.github/workflows/fly-deploy.yml` is OUTPUT of the plugin's template plus this overlay's values
 * file and `workflow/*.yml` blocks; this drift test (moved from the plugin's own
 * `scripts/__tests__/render-deploy-workflow.test.mjs`) fails while the committed file differs.
 * Re-render with:
 *   node node_modules/@jini-ai/plugin-fly/fly/scripts/render-deploy-workflow.mjs \
 *     --values content/agent-plugin-overlays/fly/tovu-production.values.json --repo-root .
 */

const overlayRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(overlayRoot, '../../..');
const valuesPath = path.join(overlayRoot, 'tovu-production.values.json');
const readFile = (file) => readFileSync(file, 'utf8');
const values = JSON.parse(readFile(valuesPath));
const rendered = () => renderFromValues({ readFile, valuesPath });

test('the committed Tovu deploy workflow is exactly the render of the plugin template plus this overlay', () => {
  const { output, contents } = rendered();
  assert.equal(output, '.github/workflows/fly-deploy.yml');
  assert.equal(readFile(path.join(repoRoot, output)), contents, 're-render with the command in this file\'s header');
});

test('the render keeps the production deploy contract', () => {
  const { contents } = rendered();
  assert.ok(!contents.includes('<<PLACEHOLDER'), 'every placeholder is filled');
  assert.doesNotMatch(contents, /^#(>>|<<) /m, 'no template marker survives the render');
  assert.match(contents, /^      - run: flyctl deploy --remote-only --config fly\.toml --build-arg TOVU_BUILD_SHA=\$\{\{ github\.sha \}\}$/m);
  assert.match(contents, /^    needs: jini-published-typecheck$/m);
  assert.match(contents, /^  group: fly-deploy-tovu-ai-cms$/m);
  assert.ok(contents.includes('  TOVU_SITE_ID: ${{ vars.TOVU_SITE_ID }}\n'));
  assert.ok(contents.includes('              TOVU_SITE_ID: env.TOVU_SITE_ID,\n'));
  assert.ok(contents.includes('              TOVU_RUNTIME_MODE: env.TOVU_RUNTIME_MODE,\n'), 'the plugin defaults no runtime mode: the job passes it');
  assert.doesNotMatch(contents, /volumes snapshots create/, 'no volume-snapshot step');
});

test('the deploy job fetches exactly the pinned plugin version and imports the generator from it, not from Tovu', () => {
  const { contents } = rendered();
  const version = values.placeholders['<<PLACEHOLDER: exact @jini-ai/plugin-fly version>>'];
  assert.match(version, /^\d+\.\d+\.\d+$/, 'an exact version, never a range or tag');
  assert.ok(contents.includes(`          PLUGIN_FLY_VERSION: "${version}"\n`));
  assert.ok(contents.includes('          npm pack "@jini-ai/plugin-fly@${PLUGIN_FLY_VERSION}" --pack-destination "$RUNNER_TEMP"\n'));
  const fetchAt = contents.indexOf('- name: Fetch the pinned Fly plugin');
  const nodeAt = contents.indexOf('- uses: actions/setup-node@v4');
  const generateAt = contents.indexOf('- name: Generate Fly config from the plugin');
  assert.ok(nodeAt !== -1 && nodeAt < fetchAt && fetchAt < generateAt, 'setup-node, then fetch, then generate');
  assert.ok(contents.includes('await import(`${process.env.RUNNER_TEMP}/plugin-fly/package/fly/deploy-configs/fly.mjs`)'));
  assert.doesNotMatch(contents, /content\/agent-plugins\/fly/);
});

test('every block the values file names exists in workflow/, and every workflow/ file is used', () => {
  const named = Object.values(values.blocks).sort();
  const files = readdirSync(path.join(overlayRoot, 'workflow')).map((name) => `workflow/${name}`).sort();
  assert.deepEqual(named, files);
});

test('supporting files follow the overlay naming rule the guidance reader enforces', () => {
  for (const name of readdirSync(path.join(overlayRoot, 'host'))) assert.match(`host/${name}`, /^host\/[a-z0-9-]+\.md$/);
  assert.match(readFile(path.join(overlayRoot, 'GUIDANCE.md')), /`host\/fly-server\.md`/);
});

test('deploy notes are keyed by target id and hold plain strings', () => {
  const notes = JSON.parse(readFile(path.join(overlayRoot, 'deploy-notes.json')));
  assert.deepEqual(Object.keys(notes), ['fly']);
  assert.ok(notes.fly.every((note) => typeof note === 'string' && note.length > 0));
});
