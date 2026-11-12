// Full-tree (not diff) run of development/scripts/test-safety-eslint.config.mjs: counts message-less
// assert/assert.ok/assert.strict calls per test file. Report-only. Run from the Tovu root:
//   node development/cloud/quality-1111/cov/scripts/test-safety-all.mjs <out.tsv>
import { ESLint } from 'eslint';
import { writeFileSync } from 'node:fs';
import config from '../../../../scripts/test-safety-eslint.config.mjs';
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config, errorOnUnmatchedPattern: false });
const results = await eslint.lintFiles(config[0].files);
const rows = results.map(r => [r.filePath.replace(process.cwd() + '/', ''), r.messages.filter(m => m.ruleId === 'no-restricted-syntax').length]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
writeFileSync(process.argv[2], ['file\tmessageless_asserts', ...rows.map(r => r.join('\t'))].join('\n') + '\n');
console.log(`files scanned: ${results.length}; files with message-less asserts: ${rows.length}; total: ${rows.reduce((s, r) => s + r[1], 0)}`);
