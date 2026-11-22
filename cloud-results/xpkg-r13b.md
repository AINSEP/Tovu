# xpkg-r13b: Tovu half (R13b revision 4)

Branch `wave3/xpkg-r13b`. Full report, gates and the one deviation: Jini `wave3/xpkg-r13b:cloud-results/xpkg-r13b.md` (Jini `205ba6d9` is the move; `f9278604` the report).

- Base `origin/refactor/terra` (`ada11733f`) + one `--no-ff` merge of `origin/wave2/xpkg-r13b-r3b` (`04748a77`).
- `53bf3270` (Checked against Jini `205ba6d9`): `owner-store.ts` keeps `countLegacyOwnerStore`/`readLegacyOwnerStore` on `@jini-ai/server/owner-store` and takes `OwnerStoreBackupError`, `OwnerStoreRecoveryError`, `readLegacyOwnerBackup`, `LegacyOwnerSnapshot` from `@jini-ai/platform/secrets/legacy-owner`; `owner-store-import.ts` and its unit test use `VaultArchiveEntry`; the integration test takes `ownerContext` from the platform subpath. No enumeration of platform subpaths exists in Tovu (`rg platform/secrets/credential-token` printed nothing), so nothing else to add.
- Gates: `npm run typecheck` exit 0 (Tovu linked to Jini `205ba6d9`; before the commit it had 13 errors, all in the four owner-store files); the unit + integration owner-store tests, 22 pass, 0 fail (`node --test`, the repo runner; the sheet's `npx vitest` does not apply to `apps/website`); `check:hooks`, `check:why-comments`, `check:errors`, `check:size`, `check:complexity` exit 0; `check:boundaries` (exit 16) and `check:architecture` (exit 1) are BASE-RED and identical to base (diffed; only the module count 6372 -> 6373). The desktop pre-push hook ran; no `--no-verify`.
- Left: merge the pair together; the owner decides the db builder-vs-`sql` deviation (Jini report).
