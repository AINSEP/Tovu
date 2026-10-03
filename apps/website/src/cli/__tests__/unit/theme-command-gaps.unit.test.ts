import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { runThemeGenerateIndexCommand } from '../../commands/theme/generate-index.js';
import { runThemeMigrateCommand } from '../../commands/theme/migrate.js';
import { runThemeNormalizeBuildCommand } from '../../commands/theme/normalize-build.js';
import { runThemeValidateCommand } from '../../commands/theme/validate.js';

// Author Checklist mutations: omit generator writes, invert JSON mode, omit skipped exit 1,
// run migration without dryRun, delete the empty-pages guard, ignore the requested profile,
// or remove install from the accepted profiles.
// Real theme services run on owned directories; disk reads verify effects before cleanup.
function harness(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-b04-theme-'));
  const output: string[] = [];
  const exitCode = process.exitCode;
  t.after(() => { process.exitCode = exitCode; fs.rmSync(root, { recursive: true, force: true }); });
  process.exitCode = undefined;
  t.mock.method(process.stdout, 'write', (chunk: string) => { output.push(chunk); return true; });
  return { root, output };
}

function staticTheme(root: string): string {
  const dir = path.join(root, 'fixture-static');
  fs.mkdirSync(path.join(dir, 'render', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'render', 'partials'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'css'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify({
    apiVersion: 2, id: 'fixture-static', name: 'Fixture', version: '0.1.0', tier: 'static',
    description: '', partials: { nav: { source: 'render/partials/nav.html' } },
  }));
  fs.writeFileSync(path.join(dir, 'tokens.json'), '{}');
  fs.writeFileSync(path.join(dir, 'css', 'theme.css'), 'body{}');
  fs.writeFileSync(path.join(dir, 'render', 'partials', 'nav.html'), '<nav>Fixture navigation</nav>');
  fs.writeFileSync(path.join(dir, 'render', 'pages', 'index.html'), '<html><head><link rel="stylesheet" href="../css/theme.css"></head><body>Fixture content</body></html>');
  return dir;
}

// F2.4/F6.3: the real generator runs; read the generated file, not just its success line.
test('generate-index resolves a relative path, writes a portability page and prints its exact destination', async (t) => {
  const h = harness(t);
  const dir = staticTheme(h.root);
  await runThemeGenerateIndexCommand({ dir: path.relative(process.cwd(), dir) });
  assert.deepEqual(h.output, [`theme 'fixture-static': generated portability index at ${path.join(dir, 'index.html')}\n`]);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /<body>Fixture content<\/body>/);
  assert.match(html, /href="css\/theme.css"/);
  assert.equal(process.exitCode, undefined);
});

test('generate-index JSON reports the exact written path and still writes the file', async (t) => {
  const h = harness(t);
  const dir = staticTheme(h.root);
  await runThemeGenerateIndexCommand({ dir, json: true });
  assert.deepEqual(JSON.parse(h.output.join('')), { status: 'written', path: path.join(dir, 'index.html') });
  assert.match(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), /<body>Fixture content<\/body>/);
  assert.equal(process.exitCode, undefined);
});

for (const json of [false, true]) {
  test(`generate-index reports a load failure (${json ? 'JSON' : 'human'}) as a skip with exit code one`, async (t) => {
    const h = harness(t);
    await runThemeGenerateIndexCommand({ dir: h.root, json });
    if (json) assert.deepEqual(JSON.parse(h.output.join('')), { status: 'skipped', reason: 'theme failed to load (invalid)' });
    else assert.deepEqual(h.output, [`theme '${path.basename(h.root)}': skipped — theme failed to load (invalid)\n`]);
    assert.equal(process.exitCode, 1);
    assert.deepEqual(fs.readdirSync(h.root), []);
  });
}

test('generate-index skips a valid declarative theme without creating a portability page', async (t) => {
  const h = harness(t);
  fs.mkdirSync(path.join(h.root, 'templates'));
  fs.writeFileSync(path.join(h.root, 'theme.json'), JSON.stringify({ id: path.basename(h.root), name: 'T', version: '1.0.0', tier: 'declarative', engine: 1 }));
  fs.writeFileSync(path.join(h.root, 'tokens.json'), '{}');
  fs.writeFileSync(path.join(h.root, 'templates', 'home.json'), '{}');
  fs.writeFileSync(path.join(h.root, 'templates', 'entry.json'), '{}');
  await runThemeGenerateIndexCommand({ dir: h.root });
  assert.deepEqual(h.output, [`theme '${path.basename(h.root)}': skipped — not a static-tier theme, or ships no index page\n`]);
  assert.equal(process.exitCode, 1);
  assert.equal(fs.existsSync(path.join(h.root, 'index.html')), false);
});

// F4.1/F6.3: discover the opaque staging path from disk and check the human preview against it.
test('migrate dry-run names the staged output and says the original theme directory is untouched', async (t) => {
  const h = harness(t);
  const dir = path.join(h.root, 'legacy-theme');
  fs.mkdirSync(path.join(dir, 'templates'), { recursive: true });
  const manifest = JSON.stringify({ id: 'legacy-theme', name: 'Legacy', version: '1.0.0', tier: 'declarative', description: 'Fixture' });
  fs.writeFileSync(path.join(dir, 'theme.json'), manifest);
  fs.writeFileSync(path.join(dir, 'tokens.json'), '{}');
  fs.writeFileSync(path.join(dir, 'styles.css'), 'body{color:red}');
  fs.writeFileSync(path.join(dir, 'templates', 'home.json'), '{"type":"doc","content":[]}');
  fs.writeFileSync(path.join(dir, 'templates', 'entry.json'), '{"type":"doc","content":[]}');
  await runThemeMigrateCommand({ dir, dryRun: true });
  const staged = fs.readdirSync(h.root).filter((name) => name !== 'legacy-theme');
  assert.equal(staged.length, 1, 'exactly one staged output must exist');
  const outputDir = path.join(h.root, staged[0]!);
  assert.deepEqual(h.output, [`theme 'legacy-theme': dry run OK — staged v2 output at ${outputDir}, real theme directory untouched\n`]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(outputDir, 'theme.json'), 'utf8')).apiVersion, 2);
  assert.equal(fs.readFileSync(path.join(outputDir, 'css', 'theme.css'), 'utf8'), 'body{color:red}');
  assert.equal(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8'), manifest);
  assert.equal(fs.readFileSync(path.join(dir, 'styles.css'), 'utf8'), 'body{color:red}');
  assert.equal(fs.existsSync(path.join(dir, 'css')), false);
  assert.equal(process.exitCode, undefined);
});

// F6.1/F6.2/F6.3: dropping either finding list or treating a failed dry run as successful
// must fail. Both independent defects are intentional, and both messages are pinned.
test('a failed migration dry-run prints validator and loader findings, sets exit one and preserves the original files', async (t) => {
  const h = harness(t);
  const dir = path.join(h.root, 'broken-theme');
  fs.mkdirSync(path.join(dir, 'templates'), { recursive: true });
  const manifest = JSON.stringify({ id: 'broken-theme', name: 'Broken', version: 'broken', tier: 'declarative', description: 'Fixture' });
  fs.writeFileSync(path.join(dir, 'theme.json'), manifest);
  fs.writeFileSync(path.join(dir, 'tokens.json'), '{}');
  fs.writeFileSync(path.join(dir, 'styles.css'), 'body{color:red}');
  fs.writeFileSync(path.join(dir, 'templates', 'home.json'), '{"type":"doc","content":[]}');
  // Missing entry.json fails the loader; the non-semver version fails the validator.
  await runThemeMigrateCommand({ dir, dryRun: true });
  const staged = fs.readdirSync(h.root).filter((name) => name !== 'broken-theme');
  assert.equal(staged.length, 1);
  const outputDir = path.join(h.root, staged[0]!);
  assert.deepEqual(h.output, [
    "theme 'broken-theme': migration FAILED — see validation/load errors below\n" +
    '  [validator:v2-version-semver] theme.json: version must be valid semver (X.Y.Z), got "broken"\n' +
    '  [loadTheme] render/pages/entry.json is required\n' +
    `staged output left for inspection at ${outputDir}\n`,
  ]);
  assert.equal(process.exitCode, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(outputDir, 'theme.json'), 'utf8')).apiVersion, 2);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['styles.css', 'templates', 'theme.json', 'tokens.json']);
  assert.equal(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8'), manifest);
  assert.equal(fs.readFileSync(path.join(dir, 'styles.css'), 'utf8'), 'body{color:red}');
  assert.equal(fs.readFileSync(path.join(dir, 'tokens.json'), 'utf8'), '{}');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'templates')), ['home.json']);
  assert.equal(fs.readFileSync(path.join(dir, 'templates', 'home.json'), 'utf8'), '{"type":"doc","content":[]}');
});

// F4.4: provide the required stylesheet so only the empty-pages guard can reject.
test('normalize-build rejects an empty comma-separated page list before changing any files', async (t) => {
  const h = harness(t);
  fs.writeFileSync(path.join(h.root, 'styles.css'), 'body{color:red}');
  fs.writeFileSync(path.join(h.root, 'index.html'), '<link rel="stylesheet" href="styles.css">');
  await assert.rejects(runThemeNormalizeBuildCommand({ dir: h.root, primaryStylesheet: 'styles.css', pages: ' , , ' }), {
    name: 'ValidationError', message: '--pages must name at least one HTML file (got an empty list)',
  });
  assert.deepEqual(h.output, []);
  assert.deepEqual(fs.readdirSync(h.root).sort(), ['index.html', 'styles.css']);
  assert.equal(fs.readFileSync(path.join(h.root, 'styles.css'), 'utf8'), 'body{color:red}');
  assert.equal(fs.readFileSync(path.join(h.root, 'index.html'), 'utf8'), '<link rel="stylesheet" href="styles.css">');
});

// F4.3/F6.2: a publish-only rule distinguishes an ignored --profile from a working one.
test('validate uses the requested profile: author advice becomes a publish error', async (t) => {
  const h = harness(t);
  const dir = staticTheme(h.root);
  await runThemeValidateCommand({ dir, profile: 'author', json: true });
  const author = JSON.parse(h.output.join(''));
  assert.equal(author.valid, true);
  assert.equal(author.warnings.some((finding: { ruleId: string }) => finding.ruleId === 'description-missing'), true);
  assert.equal(author.errors.some((finding: { ruleId: string }) => finding.ruleId === 'description-missing'), false);
  assert.equal(process.exitCode, undefined);
  h.output.length = 0;
  await runThemeValidateCommand({ dir, profile: 'publish', json: true });
  const publish = JSON.parse(h.output.join(''));
  assert.equal(publish.valid, false);
  assert.equal(publish.errors.some((finding: { ruleId: string }) => finding.ruleId === 'description-missing'), true);
  assert.equal(publish.warnings.some((finding: { ruleId: string }) => finding.ruleId === 'description-missing'), false);
  assert.equal(process.exitCode, 1);
});

// F4.3/F4.4: unread v2 fields distinguish install from author; missing description stays advisory.
test('validate accepts install and rejects unread runtime fields while retaining polish warnings', async (t) => {
  const h = harness(t);
  const dir = staticTheme(h.root);
  await runThemeValidateCommand({ dir, profile: 'author', json: true });
  const author = JSON.parse(h.output.join(''));
  assert.equal(author.valid, true);
  assert.equal(author.warnings.some((finding: { ruleId: string }) => finding.ruleId === 'v2-partials-unimplemented'), true);
  h.output.length = 0;
  await runThemeValidateCommand({ dir, profile: 'install', json: true });
  const install = JSON.parse(h.output.join(''));
  assert.equal(install.valid, false);
  assert.deepEqual(install.errors.map((finding: { ruleId: string; severity: string }) => [finding.ruleId, finding.severity]), [
    ['v2-partials-unimplemented', 'error'],
  ]);
  assert.equal(install.warnings.some((finding: { ruleId: string }) => finding.ruleId === 'description-missing'), true);
  assert.equal(process.exitCode, 1);
});
