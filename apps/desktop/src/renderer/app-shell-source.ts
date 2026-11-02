/**
 * @file Test support: the renderer shell's source text — `App.tsx` followed by every component file
 * split out of it into `app/` — for the older wiring tests that assert against source. Those tests
 * were written while every shell component lived in `App.tsx`; reading the same components as one
 * string keeps each assertion pointed at the same code after the split. New tests render the real
 * modules instead (`app/*.render.test.ts`). Not a test file itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** `App.tsx`, then `app/*.tsx` in name order, joined by newlines. */
export function appShellSource(_input = {}, _options = {}): string {
  const componentDir = path.join(here, 'app');
  const components = fs.readdirSync(componentDir)
    .filter((name) => name.endsWith('.tsx'))
    .sort()
    .map((name) => path.join(componentDir, name));
  return [path.join(here, 'App.tsx'), ...components].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}
