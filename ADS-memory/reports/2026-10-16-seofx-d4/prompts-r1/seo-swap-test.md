# Update one stale test to the current SEO image row UI

Persona: Programmer (test-only change). Repo: Tovu (/Users/la/Programming/Tovu).

RULES: do NOT run tests, typecheck or builds. Do NOT commit or touch git state. Edit only the one
test file below. Report `CHANGED FILES:` + `NOT DONE:`. Smallest change. Keep "why" comments.

File: `apps/admin/src/integrations/jini-admin/__tests__/seo-swap.unit.test.tsx`, test
"uses the host picker to hydrate a CMS slug before writing the SEO image reference" (~line 148).

It is stale: it looks up the label "Default Open Graph / Twitter image" and expects a text input
to have value "Selected image". The Jini SEO settings image row is now
`Jini/packages/admin/src/seo/react/components/MediaRefField.tsx`: a `role="group"` row named by its
caption (find the current label string for the site-default image in
`Jini/packages/admin/src/seo/messages.en.ts` / `react/pages/SeoPage.tsx`, the `defaultOgImage`
field), showing the chosen file's NAME (`.jini-media-ref-field-name`) and a "Choose image" button,
plus a hidden `<input name="defaultOgImage">` carrying the exact value. There is no text box.

Rewrite only that test's lookup and assertions so it keeps proving the same thing:
- find the row by the current caption (e.g. `findByRole('group', { name: <current label> })`), and
  click its "Choose image" button (scope with `within` if more than one exists);
- after the pick, assert the row shows the picked file's name (whatever the name logic yields for
  this fixture; read `useWiredMediaRefField`/`rules.ts` name helpers to get it right — likely the
  title "Cover" plus an extension, check `withExtension`), and that
  `new FormData(form).getAll('defaultOgImage')` is `['cover-slug:public']` (get the form from the
  hidden input or the row via `closest('form')`);
- keep the `pick` and `fetch` expectations unchanged.
