# judge-sweep-46b (saved by tovu-46 from the agent's report; harness blocked its write). Handoff: .local-artifacts/handoffs/2026-10-15-judge-sweep-46b.md
- Tovu: bea391cdc s05, 96944c2b6 s05 survivor tests, a8ba2e4dd storage-move empty PG, a5fa11a72 s06, c7cab609e s07, 9d173b7c3 s08 boundaries + vault move, c4f4411cc s02 rest, 872c76848 BYOK post-boot skills. Jini: b0b13de4 store-copy excludeTable, a1c45494 j1 vitest config.
- RED→GREEN recorded per commit (overnight #16 #19-#26 #30 #31 #33 #111 #142, r1/r2b rows). Root tsc 0 errors after Jini db rebuild.
- Mutation: seal-aad 11/11, use-sites 8/8; hand mutants killed on deps.ts/app.ts drain, registry owners check, Jini catalog/constraint filters. Survivors → Codex: pages.ts nested redirect (r3h), 7 registry.ts validators (r3g), Jini index filter equivalent (r3i, uncommitted).
- Codex r3–r3i all exit 0. Sent back: r3b crashed 25 discovery tests (eval fake lacked skillLayout → r3e); a write-region ranking (r3f); survivors.
- Leftovers: batch 3 ($S/b3.sh) verifies r3f-r3i + mutation → then commit s04, registry.test, redirects-site-serving.test, Jini store-copy follow-up. checkpoint-stopped-wal.ts mutation. Judge s08 r1 --12+ and s09/s10/s11.
- Home: sites.json rewritten 17:27/18:56 by other writers; still 4 sites, 859 keys (tovu-46 checked format: unchanged version/entries/migrations).
