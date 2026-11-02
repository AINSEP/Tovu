import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNodePackagingFilesystem } from '@jini-ai/devops/packaging/electron';
import { payloadClosureScan } from './staged-closure-scan.ts';

test('payload closure scan covers all of dist except agent-plugin skill folders', () => {
  const dist = mkdtempSync(path.join(tmpdir(), 'tovu-closure-scan-'));
  try {
    const files = [
      'src/cli/main.js',
      'content/agent-plugins/google-workspace/tools/sheets.mjs',
      'content/agent-plugins/ui-ux-design/plugin.json',
      'content/agent-plugins/ui-ux-design/skills/shadcn-ui/SKILL.md',
      'content/agent-plugins/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx',
      'content/themes/static/tovu-theme/skills/not-a-plugin.js',
    ];
    for (const file of files) {
      mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
      writeFileSync(path.join(dist, file), '');
    }
    const scan = payloadClosureScan({ dist }, { fs: createNodePackagingFilesystem({}) })
      .map(file => path.relative(dist, file).split(path.sep).join('/')).sort();
    assert.deepEqual(scan, [
      'content/agent-plugins/google-workspace/tools/sheets.mjs',
      'content/agent-plugins/ui-ux-design/plugin.json',
      'content/themes/static/tovu-theme/skills/not-a-plugin.js',
      'src/cli/main.js',
    ]);
  } finally { rmSync(dist, { recursive: true, force: true }); }
});
