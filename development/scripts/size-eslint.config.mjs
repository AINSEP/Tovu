import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import { complexityIgnores, complexityScopes } from './complexity-eslint.config.mjs';

export const sizeExceptions = JSON.parse(readFileSync(new URL('./size-exceptions.json', import.meta.url), 'utf8'));
if (sizeExceptions.limits.functionLines !== 80 || sizeExceptions.limits.functionWarnLines !== 50 || sizeExceptions.limits.fileLines !== 500) {
  throw new Error('Size limits must match the owner-approved warn 50, error 80, file 500 policy.');
}
for (const entry of [...sizeExceptions.pathExclusions, ...sizeExceptions.entries]) {
  if (typeof entry.reason !== 'string' || !entry.reason.trim()) throw new Error('Size exceptions require a reason.');
}
for (const entry of sizeExceptions.entries) {
  if (entry.repo !== 'tovu' || !entry.function) continue;
  const name = typeof entry.identity === 'string' ? entry.identity.split('.').at(-1)?.replace(/#\d+$/, '') : '';
  if (name !== entry.function || !/#\d+$/.test(entry.identity)) throw new Error('Function exceptions require the matching qualified identity.');
}

const root = fileURLToPath(new URL('../..', import.meta.url));
const excludedPaths = sizeExceptions.pathExclusions
  .filter(entry => entry.repo === 'tovu' || entry.repo === '*')
  .map(entry => new RegExp(entry.pattern));
const isExcludedPath = file => {
  const relative = path.relative(root, file).split(path.sep).join('/');
  return excludedPaths.some(pattern => pattern.test(relative));
};
const functionSizeOptions = { skipBlankLines: true, skipComments: true, IIFEs: true };

// Keep exclusions local in the editor, so they affect size rules only.
export const sizeConfig = [{
  files: complexityScopes,
  ignores: [...complexityIgnores, isExcludedPath],
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
  linterOptions: { noInlineConfig: true },
  rules: {
    'max-lines-per-function': ['warn', { max: sizeExceptions.limits.functionWarnLines, ...functionSizeOptions }],
    'max-lines': ['error', { max: sizeExceptions.limits.fileLines, skipBlankLines: true, skipComments: true }],
  },
}];

// ESLint keeps only one level per rule, so the standalone gate overrides the editor warning.
const gateSizeConfig = {
  ...sizeConfig[0],
  rules: {
    ...sizeConfig[0].rules,
    'max-lines-per-function': ['error', { max: sizeExceptions.limits.functionLines, ...functionSizeOptions }],
  },
};
export default [{ ignores: [...complexityIgnores, isExcludedPath] }, gateSizeConfig];
