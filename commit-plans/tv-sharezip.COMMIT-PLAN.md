# T5

Base: `7801b3d883` (`codex/tv-c7a`), supplied by dispatch. Working branch: `codex/tv-sharezip`.

Files:

- `apps/website/src/features/site-backup/share-backend.ts`
- `apps/website/src/features/site-backup/__tests__/share-backend.unit.test.ts`
- `COMMIT-PLAN.md`

The private `requireNoShareCredentialWarnings` guard refuses nonempty warning lists with `SiteShareRefusal`, code `UNSAFE_FILE`, and the prescribed message. Both export paths call it immediately after ZIP construction, before delivery or registration. The existing failure boundary preserves the refusal.

Tests written before production changes:

- `a full share with prepared credential warnings refuses before delivery or registration`: expected red because the original path accepts prepared warnings, calls delivery, and creates a row. Asserts refusal class/code, no registry row, and no delivery lookup.
- `a static export with captured credential content refuses before registration`: expected red because the original ZIP collector records the fixture's credential warning and still registers the export. Asserts refusal class/code and no registry row.

Existing successful clean-export cases are unchanged. Every added assertion has a plain-words message. Tests, builds, installs, type checks, linters, and coverage were not run, per dispatch.

Read-only caller check: `git grep -n -F 'createSiteShare(' -- apps/` found only the two named production callers, plus the declaration and test callers.

Mutations owed to combine; not run:

- Remove the backup guard call: the full-share regression must fail.
- Remove the static guard call: the static regression must fail.

Chrome checks owed later: admin refusal message and successful clean download.

Diff re-read deletions: none; no unrelated edits found. Source review: no new dependencies, casts, comments, or boundary changes; changed functions remain below the sheet's limits. No touched file exceeds 500 lines. No commit or push performed.

FIXES: open-bugs 2026-11-20 share ZIP credential warnings
