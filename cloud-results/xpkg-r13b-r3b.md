# xpkg-r13b-r3b (Tovu half)

Full report: Jini `cloud-results/xpkg-r13b-r3b.md` on branch `wave2/xpkg-r13b-r3b`.

Base `origin/refactor/terra` (232764af5) + one `--no-ff` merge of Tovu `wave1/xpkg-C9c-C12OBS` (c92cc9d64; the C9c pair that mounts `UserManagementKitProvider`, needed by R3b).
Commits (test files only): 5bdf79ff9, 894fae06b (fixes the previous one: its provider line had not applied), fb2031357. Each checked against the Jini SHA named in its message.
Gates: `npm run typecheck` exit 0; `check:size`/`check:complexity`/`check:architecture` red on base and byte-identical after; `check:hooks`/`check:errors` exit 0, identical; full `apps/admin` vitest 895/896 files, 14789 tests passed (the one failing file needs an unbuilt Jini provider-plugins artifact: ENV).
