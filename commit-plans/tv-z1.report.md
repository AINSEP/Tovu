All nine sheets are **done** on `codex/tv-z1`, base `776ce6d0f0`. No STOPs.

- **H-LIST-NEWS:** Updated newsletter handler/catalog and both payload-test files. Added one combined 100/101-row regression case.
- **H-LIST-VISITOR:** Updated `site/tools.ts`, `tools.test.ts`, and `capability-registry.test.ts`. Existing cap case checks completeness; existing reads use the envelope. No new registry case or cast.
- **TV-C3:** Updated all five settings comment files. Exact comparison: **5/5** rows; none stopped.
- **TV-C1:** Updated the eight listed citation files plus `tiptap-text-schema.ts`. Exact comparison: **9/9** rows; none stopped.
- **TV-C2:** Updated `media-embed-extension.tsx`, `media-image-extension.tsx`, `import-media-entity.ts`, and `MenuEditor.tsx`. Exact comparison: **4/4** rows; none stopped.
- **TV-I18N-PICKER:** Updated the component and existing incident test to require Spanish `Cancelar`. Picker hook untouched.
- **N-age-leaves-T:** Created all three leaf `.npmrc` files; each matches root lines 1–3 byte-for-byte.
- **N-audit-T:** Updated both workflow files with the four report-only dependency audits, without `id:` fields.
- **M-Q3-T:** Updated media-generation handler/catalog and added one omitted-model regression case. Credential resolution and golden fixture untouched.

Tests were written and reviewed before source changes; none were run. No builds, installs, linters, commits, pushes, or lockfile changes.

[COMMIT-PLAN.md](SCR/c-tv-z1/COMMIT-PLAN.md) records every file, red reason, file-size note, and combine obligation, including the media golden refresh after `r62t-tests`.

[REFRESH.md](SCR/c-tv-z1/REFRESH.md) records the grep-reached newsletter payload test. Diff re-read removed two unnecessary assertion-message additions; no other cleanup deletions.
