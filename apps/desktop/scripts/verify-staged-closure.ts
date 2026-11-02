/** Audit the actual app.asar and its sibling Resources/tovu.
 * Node's parent-aware resolver is enabled by the package script's explicit runtime flag. */
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractAll } from '@electron/asar';
import ts from 'typescript';
import { auditStagedClosure, createNodePackagingFilesystem, createNodeRuntimeResolver } from '@jini-ai/devops/packaging/electron';
import { createTypeScriptImportReader } from '@jini-ai/devops/packaging/electron/typescript';
const fs = createNodePackagingFilesystem({});
const imports = createTypeScriptImportReader({ compiler: ts });
const resolver = createNodeRuntimeResolver({});
/** Both closures are mandatory; a missing stage is a failure, never an empty successful walk. */
function check({ payload, resources, app }: { payload: string; resources: string; app: string }): void {
  for (const entry of [path.join(payload, 'dist'), path.join(app, 'src', 'main', 'index.ts')]) {
    if (!existsSync(entry)) throw new Error(`staged closure input missing: ${entry}`);
  }
  const inputs = [
    { root: payload, scan: [path.join(payload, 'dist')], hostModules: new Set<string>() },
    { root: resources, packageRoots: [app], scan: [path.join(app, 'src', 'main', 'index.ts'), path.join(app, 'bin')], hostModules: new Set(['electron']) },
  ];
  const results = inputs.map(input => auditStagedClosure({ ...input, fs, imports, resolver }));
  for (const result of results) {
    for (const message of result.optIns) console.log(`staged-closure: allowed ${message}`);
    for (const problem of result.problems) console.error(`staged-closure: ${problem}`);
    console.log(`staged-closure: checked ${result.checked} files; ${result.problems.length} missing runtime imports`);
  }
  if (results.some(result => result.problems.length)) process.exitCode = 1;
}
const archiveIndex = process.argv.indexOf('--asar');
const archive = archiveIndex < 0 ? undefined : process.argv[archiveIndex + 1];
if (!archive) throw new Error('--asar requires an archive path');
const resources = mkdtempSync(path.join(tmpdir(), 'tovu-closure-'));
try {
  const app = path.join(resources, 'app');
  extractAll(path.resolve(archive), app);
  // Preserve the archive's sibling website imports at the same relative resource location.
  cpSync(path.join(path.dirname(path.resolve(archive)), 'website'), path.join(resources, 'website'), { recursive: true });
  check({ payload: path.join(path.dirname(path.resolve(archive)), 'tovu'), resources, app });
} finally { rmSync(resources, { recursive: true, force: true }); }
