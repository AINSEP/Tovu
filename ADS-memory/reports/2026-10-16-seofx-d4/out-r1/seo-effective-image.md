Programmer(Direct): Programmer persona for the SEO read projection and admin UI changes.

Implemented content-image provenance, muted inherited-image copy, all 21 translations, and regression tests. Existing hook/page forwarding already preserves the source value.

CHANGED FILES:

```text
/Users/la/Programming/Tovu/apps/website/src/features/seo/cover-image.ts
/Users/la/Programming/Tovu/apps/website/src/features/seo/page-head-contributor.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/seo/get-entry.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/seo/get-entry-analyze.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/seo/put-entry.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/seo/__tests__/get-entry.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/seo/__tests__/put-entry.test.ts
/Users/la/Programming/Tovu/apps/admin/src/features/seo/seo-i18n.ts
/Users/la/Programming/Jini/packages/cms/src/seo/types.ts
/Users/la/Programming/Jini/packages/cms/src/seo/seo.ts
/Users/la/Programming/Jini/packages/cms/src/seo/__tests__/share-image.unit.test.ts
/Users/la/Programming/Jini/packages/cms/src/seo/__tests__/seo.test.ts
/Users/la/Programming/Jini/packages/admin/src/core/ports/seo.ts
/Users/la/Programming/Jini/packages/admin/src/seo/rules.ts
/Users/la/Programming/Jini/packages/admin/src/seo/models.ts
/Users/la/Programming/Jini/packages/admin/src/seo/react/components/MediaRefField.tsx
/Users/la/Programming/Jini/packages/admin/src/seo/messages.en.ts
/Users/la/Programming/Jini/packages/admin/src/seo/__tests__/rules.unit.test.ts
/Users/la/Programming/Jini/packages/admin/src/seo/react/__tests__/copy-polish.unit.test.tsx
/Users/la/Programming/Jini/packages/admin/src/seo/react/__tests__/use-seo-entry-panel.unit.test.ts
```

Additional file `seo.test.ts`: updated its exact-meta expectation for the new `imageSource` field.

NOT DONE:

- Tests, typechecks, builds, and package scripts were not run, as instructed.
- No git operations performed. Public head test expectations remain untouched.
