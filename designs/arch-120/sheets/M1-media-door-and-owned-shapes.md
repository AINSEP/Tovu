# Sheet M1 — media's door for access-evidence and purge; media owns the shapes it reads

Executor: one agent, unattended. Budget ≤ 150k context, ≤ 110 tool calls, 90 min. Branch `refactor/arch-120-m1` from a `$BASE` that contains R1. Design: REVISION-2 §4, rows N030 N031 N036 N062 N063 N046 N050.
Owner rules: same as R1. No `vi.mock` and no module mocks. Behavior is unchanged: this sheet only changes import paths and type declarations.

## 1. Prerequisites (each STOPs)

```bash
set -euo pipefail
F=apps/website/src/features
grep -q 'feature-ranks' development/scripts/check-architecture.ts || { echo "STOP P1: R1 is not in this base"; exit 1; }
grep -q '^export { purgeMedia } from "./purge-media.js";' $F/media/index.ts || { echo "STOP P2: media/index.ts no longer exports purgeMedia"; exit 1; }
! grep -q 'invalidateMediaAccessEvidence' $F/media/index.ts || { echo "STOP P3: index already exports invalidateMediaAccessEvidence"; exit 1; }
grep -q "^import type { PostRecord } from '../post/post.js';" $F/media/access-evidence.ts || { echo "STOP P4: access-evidence.ts header changed"; exit 1; }
grep -q "^import type { PostRepoPort } from '#src/features/post/contracts';" $F/media/where-used.ts || { echo "STOP P5: where-used.ts import changed"; exit 1; }
grep -l "media/access-evidence" $F/post/repo.ts $F/post/repo.memory.ts $F/entries/repo.sqlite.ts $F/entries/trash-aware-memory-repo.ts 2>/dev/null > "$RUN/m1-importers" || true
cat "$RUN/m1-importers"   # 4 files on b5fbf2a5e; 3 if wave3/su-cms(-3) merged first (it deletes the trash-aware import). Fewer than 3: STOP P6.
test "$(wc -l < "$RUN/m1-importers" | tr -d ' ')" -ge 3 || { echo "STOP P6: importer set changed"; exit 1; }
```

Run Setup and Gate block G for the base. On an R1 base, `$RUN/base/architecture.new` holds `media/access-evidence.ts -> post/post.ts` and `media/where-used.ts -> post/contracts.ts`. `$RUN/base/boundaries.errors` holds the 5 (or 4) `no-deep-imports:features/media` lines from `post/repo*.ts`, `entries/*.ts` and `forms/form-file-maintenance.ts`.

## 2. Characterization (green on base, before any edit)

These existing tests exercise every touched behavior. Run them and keep the log:

```bash
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks \
  apps/website/src/features/media/__tests__/mediawidget-where-used.test.ts \
  apps/website/src/features/entries/__tests__/repo.characterization.test.ts \
  apps/website/src/features/trash/__tests__/post-trash-media-evidence.integration.test.ts \
  apps/website/src/features/forms/__tests__/form-file-maintenance.test.ts \
  apps/website/src/server/inbound/admin-http/routes/media/__tests__/media-route-failures.unit.test.ts > "$RUN/char.log" 2>&1
```

It must exit 0. If it does not, STOP C1 and report the failing names: the base is not usable.

## 3. Red test

Add `apps/website/src/features/media/__tests__/media-owned-shapes.unit.test.ts`. It imports `invalidateMediaAccessEvidence` and `getMediaAccessEvidenceCache` from `#src/features/media/index`, fills the cache for an owner object, calls `invalidateMediaAccessEvidence({ owner })` and asserts the cache is empty. This is the behavior post and entries rely on, now through the door. It must fail before the change (the index has no such export), with a non-zero status and a message naming the missing export:

```bash
rc=0; TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test apps/website/src/features/media/__tests__/media-owned-shapes.unit.test.ts > "$RUN/red.log" 2>&1 || rc=$?
test "$rc" -ne 0 && grep -q 'invalidateMediaAccessEvidence\|getMediaAccessEvidenceCache' "$RUN/red.log" || { echo "STOP R1: red test did not fail for the expected reason"; exit 1; }
```

## 4. Changes

1. `media/index.ts`: add `export { invalidateMediaAccessEvidence, getMediaAccessEvidenceCache } from "./access-evidence.js";` and `export type { AssetReferenceScan, AssetReferenceIndex } from "./access-evidence.js";`. `access-evidence.ts` is already exposed (composition `deps.ts:305` and `media-rendition.ts:1` import it), so the API surface cannot rise.
2. Repoint the value import in each file from `m1-importers`, and in `forms/form-file-maintenance.ts` (`purgeMedia`), to `#src/features/media/index` (the `#src/` alias, matching the repo's other cross-feature imports).
3. `media/access-evidence.ts`: delete the `PostRecord` import. Declare `/** The one post field the access index reads; media owns this shape (no import of post). */ export interface MediaAccessSettings { readonly memberAccessJson?: string | null }` and use `MediaAccessSettings` wherever `Pick<PostRecord, 'memberAccessJson'>` stood. STOP M1 if `post/post.ts` no longer declares `memberAccessJson?: string | null`. Typecheck then proves that `PostRecord` still satisfies the shape.
4. `media/where-used.ts`: delete the `PostRepoPort` import. Declare a `MediaPostListPort` with the single `list({ workspaceId })` method, whose result items carry exactly the fields the function reads: `id`, `deletedAt`, `bodyJson`, `bodyHtml`, `seoExtJson`, `bodyFormat`. Copy each field's type from `post/post.ts`, as written there. Use it in the `deps` type. Callers pass a real post repo, and `typecheck` proves it satisfies the port. STOP M2 if `typecheck` needs a cast anywhere.
5. Behavior does not change, so the characterization log must stay identical in its pass list.

## 5. Gate and commits

Commit 1 holds the red test and changes 1–2 (door). Commit 2 holds changes 3–4 (owned shapes). Before each commit, run Gate block G with `OUT=$RUN/now` and `FILES` = the touched `.ts` files. Expected after commit 2: `architecture.new` loses the 2 media→post lines; `boundaries.errors` loses the 5 (or 4) media deep-import lines; API surface is unchanged or one lower (`purge-media.ts` is no longer exposed); pairs are unchanged. Re-run step 2's command: exit 0. Then `git pull --rebase`, re-run G, and push. Report every SHA and the before/after counts of the three files.
