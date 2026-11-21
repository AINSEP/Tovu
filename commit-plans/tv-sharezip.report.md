Done — T5 changes written; tests remain unrun per the machine rule.

Files touched:

- `apps/website/src/features/site-backup/share-backend.ts`
- `apps/website/src/features/site-backup/__tests__/share-backend.unit.test.ts`
- `COMMIT-PLAN.md`

Both ZIP paths now reject credential warnings with `SiteShareRefusal` code `UNSAFE_FILE` before delivery or registration.

Tests added before production edits:

- **“a full share with prepared credential warnings refuses before delivery or registration”** — expected red before the fix because the original path accepts warnings, calls delivery, and registers the share.
- **“a static export with captured credential content refuses before registration”** — expected red because the original path collects the warning and still registers the export.

Existing clean-export cases are unchanged. The required caller check found no additional production caller.

Diff re-read deletions: none. `COMMIT-PLAN.md` records the base, required FIXES entry, mutations owed, and later Chrome checks. No commits performed.
