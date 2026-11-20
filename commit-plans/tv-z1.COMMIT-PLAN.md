# codex/tv-z1 commit plan

All sheets use merge-6, `776ce6d0f0`. Working-tree edits only; coordinator stages and commits. Tests, builds, installs, type checks, linters, mutations and Chrome checks were not run, per dispatch. Bug tests were written and read against the old source before source edits; red reasons below are inspection evidence, not executed results.

## H-LIST-NEWS — done — base merge-6 (`776ce6d0f0`)

- Files: `apps/website/src/features/newsletter/{tool-registrations.ts,agent-tools.ts,__tests__/tool-registrations.model-facing-errors.test.ts}`, plus the grep-reached `apps/website/src/assistant/__tests__/tool-registrations.newsletter.test.ts` (recorded in REFRESH.md).
- New test: `newsletter_list_send_log reports completeness at 100 sends and truncates 101 in id order`. Updated exact payloads in `authorized subscription, archive, cancel and pause tools persist and return their mapped views` and `newsletter list tools return only rows from the requested list or campaign`.
- Red reason: old handler returns no `truncated` field and reads only 100 rows, so it cannot distinguish 100 from 101. The single new case checks both boundary payloads, projection and id order.
- Model-output shape changes from `{ sends }` to `{ sends, truncated }`; description states the 100-row cap. Admin HTTP route untouched.
- Combine owes mutations removing `+ 1` and changing `>` to `>=`. No Chrome look.
- Deletions at diff re-read: none.
- File-size note: `features/newsletter/tool-registrations.ts` is 569 lines and the grep-reached `assistant/__tests__/tool-registrations.newsletter.test.ts` is 587 lines; both already exceeded 500 on the base. Continued as instructed.

## H-LIST-VISITOR — done — base merge-6 (`776ce6d0f0`)

- Files: `apps/website/src/assistant/site/tools.ts`, `apps/website/src/assistant/site/__tests__/{tools.test.ts,capability-registry.test.ts}`.
- Updated `caps search_published_entries at maxResults`: above-cap true and exactly-at-cap false after filtering. Repointed existing published-only, output-shape, matching and empty-result reads; changed only the existing registry cast's type/read in `executes and returns the capability's result for a granted caller`. No new registry case or cast.
- Red reason: old search returns a bare array with no completeness signal; the updated reads and both boundary assertions require the envelope.
- Model-output shape changes from an array to `{ entries, truncated }`. Registry production code unchanged. The named visitor safety integration test matches JSON text and needs no edit.
- Combine owes mutations removing the field / using `>=`, and one visitor-chat Chrome look with more than 20 public matches.
- REFRESH.md: no additional visitor consumers. Deletions at diff re-read: removed two unnecessary added messages from otherwise unchanged assertions (published-slug sorting and registry result slugs); kept messages on every added/changed assertion.

## TV-C3 — done — base merge-6 (`776ce6d0f0`)

- Comment text only in `apps/website/src/features/settings/site-title-write.ts` and `apps/website/src/server/inbound/admin-http/routes/settings/{get-effective.ts,get-raw.ts,reset.ts,shared.ts}`.
- All five old citation anchors held; all five now cite exactly `packages/core/src/settings/cms-adapter.ts`. No stopped files or Jini-side changes.
- Validation: byte-for-byte comparison against base with only the specified substitution: 5/5 exact. Combine owes restoring one old citation as the comment-sheet mutation. No tests or Chrome look.
- REFRESH.md: none. Deletions at diff re-read: none.

## TV-C1 — done — base merge-6 (`776ce6d0f0`)

- Comment text only in `apps/admin/src/lib/post-title-extension.ts`, `apps/website/src/features/{pages/skeleton.ts,post/agent-tools.ts,theme/theme.ts,post/tiptap-text-schema.ts}`, `apps/website/src/server/inbound/public-http/middleware/{site-chat-static.ts,theme-preview-static.ts,theme-static-assets.ts}`, and `apps/website/src/server/runtime/configuration/seed.ts`.
- Eight full-path rows replaced with their exact design destinations; the ninth row in `tiptap-text-schema.ts` uses exactly `the site renderer's renderDocNode/renderMarks` (symbols remain backticked). All old anchors held; no stopped rows. No wait or merge of xd5 branches.
- Validation: byte-for-byte comparison against base with only the specified substitution: 9/9 exact. Combine takes this `theme.ts` comment over tv-xd5-publish and owes the old-citation mutation. No tests or Chrome look.
- REFRESH.md: none. Deletions at diff re-read: none.

## TV-C2 — done — base merge-6 (`776ce6d0f0`)

- Comment text only in `apps/admin/src/lib/{media-embed-extension.tsx,media-image-extension.tsx}`, `apps/website/src/features/media/import-media-entity.ts`, and `apps/admin/src/features/menus/MenuEditor.tsx`.
- Three relative paths replaced with their exact design destinations; MenuEditor now cites `(renderWidgetMenu)` with the symbol backticked. All four old anchors held; no stopped rows. `site-exporter.ts` untouched.
- File-size note: `MenuEditor.tsx` remains 528 lines, already above 500 on the base; continued as instructed.
- Validation: byte-for-byte comparison against base with only the specified substitution: 4/4 exact. Combine owes the old-citation mutation. No tests or Chrome look.
- REFRESH.md: none. Deletions at diff re-read: none.

## TV-I18N-PICKER — done — base merge-6 (`776ce6d0f0`)

- Files: `apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx` and `apps/admin/src/components/MediaPickerDialog/__tests__/JiniMediaPicker.hooks.unit.test.tsx`.
- Updated existing test `retains the API incident with redacted picker evidence and a cancel action`: inject Spanish locale into the component and require the button's accessible name `Cancelar`. Redaction/incident assertions and cancellation test retained. No new case.
- Red reason: old component neither accepts the injected locale prop nor translates its literal `Cancel`, so the Spanish accessible-name query cannot succeed.
- Component calls the injected locale hook, defaulting to `useAdminLocale`, and uses the existing shared translator. Both exports verified; no production caller supplies the new prop. `JiniMediaPicker.hooks.ts` untouched; no `cancelLabel` field.
- Combine owes mutation restoring literal `Cancel`, and Spanish/English picker-error Chrome looks with dismissal.
- REFRESH.md: none. Deletions at diff re-read: none.

## N-age-leaves-T — done — base merge-6 (`776ce6d0f0`)

- New files: `apps/admin/.npmrc`, `apps/desktop/.npmrc`, `apps/site-chat/.npmrc`; all three were absent and now contain root `.npmrc` lines 1–3 verbatim, including the comment. No locks changed.
- Tests: none added or run. Combine owes young third-party version refusal, eligible `@jini-ai/*` selection and frozen installs without lock changes; remove one leaf's first setting for the named acceptance mutation. No Chrome look.
- REFRESH.md: none. Deletions at diff re-read: none.

## N-audit-T — done — base merge-6 (`776ce6d0f0`)

- Files: `.github/workflows/ci.yml`, `.github/workflows/desktop.yml`. Absorbs N-audit-desktop-T.
- Root/admin/site-chat report-only dependency audit steps follow root install and precede the GATES comment; desktop report-only audit follows desktop install. All use `npm audit --package-lock-only`, all have `continue-on-error: true`, none has `id:`. Install anchors present; no pre-existing dependency audit. Existing `Hardwiring audit guards` is an unrelated source guard.
- Tests: none. Combine owes first CI logs showing each lock's audit and subsequent gates continuing on advisory exits. No scope-check mutations (culled), no Chrome look.
- File-size note: `ci.yml` is 610 lines, already above 500 on the base; continued as instructed.
- REFRESH.md: none. Deletions at diff re-read: none.

## M-Q3-T — done — base merge-6 (`776ce6d0f0`)

- Files: `apps/website/src/features/media-generation/{tool-registrations.ts,agent-tools.ts,__tests__/tool-registrations.test.ts}`.
- One new test: `an omitted model uses the image model saved with the provider credential`; saves OpenAI `dall-e-3` through the existing fixture with an env credential also supplied, omits `model` and asserts dispatched `request.model` is `dall-e-3`.
- Red reason: old resolver chooses the first credential-backed catalog model (`gpt-image-2`) and ignores the saved credential's `model`. Existing env-only, credential precedence, explicit-model and unreadable-credential tests retained.
- Added exactly the marker read and catalog-order match before credential search, named doc sentence and exact description replacement. Export, sole caller, old description and fixture verified; marker map uses canonical provider IDs. No new casts or changes to `resolveCredentialForProvider`, explicit validation or dispatch.
- Combine owes mutation deleting `if (savedModel) return savedModel;`, Admin-save/omitted-model Chrome look, and only this description's golden byte refresh in `apps/website/src/assistant/__tests__/fixtures/moved-tools.golden.json` AFTER the r62t-tests repair and attributed catalog diff. Golden untouched here.
- File-size note: `__tests__/tool-registrations.test.ts` is 799 lines, already above 500 on the base; continued as instructed.
- REFRESH.md: none. Deletions at diff re-read: none.
