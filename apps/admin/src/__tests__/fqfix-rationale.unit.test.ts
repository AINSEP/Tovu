import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

// Documentation-only regressions: pin the rationale to its owning code, not merely somewhere
// in a file. Behavioral cache tests cover the execution; these preserve the requested why notes.
const read = (file: string) => readFileSync(path.resolve(__dirname, '..', file), 'utf8');
it('keeps advisory site-key rationale beside the read and its unknown state', () => {
  const source = read('features/dashboard/hooks/use-dashboard.hooks.ts');
  expect(source).toContain('// Site-key plan §A.6 — same advisory shape as the password status read:\n  // a failed fetch means no banner, not an error card.\n  const siteKeyQueryFetch =');
  expect(source).toContain('// undefined until the site-key status fetch settles (or forever if it fails).\n  // shouldShowSiteKeyBanner treats undefined as "don\'t show".\n  const siteKeyState =');
});
it('keeps the non-static tier explanation beside the template query enablement', () => {
  const source = read('components/TemplateSource/use-template-source.hooks.ts');
  expect(source).toContain('// Nothing to fetch — the caller renders the tier explanation instead for non-static themes.\n  const query = useFetchQuery(');
  expect(source).toContain('enabled: themeTier === "static"');
});
it.each([
  'features/dashboard/hooks/use-dashboard.hooks.ts', 'features/posts/hooks/use-posts.hooks.ts',
  'features/pages/hooks/use-pages.hooks.ts', 'features/recovery/hooks/use-recovery.hooks.ts',
  'hooks/use-admin-locale.hooks.ts', 'hooks/admin-locale-dependencies.hooks.ts',
  'components/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx', 'components/TemplateSource/use-template-source.hooks.ts',
])('removes detached descriptions of replaced read lifecycles in %s', file => {
  expect(read(file)).not.toContain('Read-lifecycle rationale retained from the preceding implementation');
});
