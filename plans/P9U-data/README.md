# P9U-data — reproducible inputs for `plans/P9U-untangle-v2.md`

Measured on Tovu `41e948ee4` (`origin/integ/merge-12-2026-11-22`), non-test `.ts/.tsx` under `apps/admin/src` (tests, `__tests__/`, `__measurements__/` excluded). Specifiers resolved: relative and `@/*`.

```
node -I plans/P9U-data/tools/scan.mjs <Tovu>/apps/admin/src > edges.json      # every local import, line, type-only flag
node -I plans/P9U-data/tools/pairs.mjs edges.json list                         # SCCs + per-pair edge list
node -I plans/P9U-data/tools/detour.mjs edges.json                             # feature -> shared -> other feature detours
node -I plans/P9U-data/tools/ranks.mjs edges.json "" <Tovu>/apps/admin/src/features   # edges left after the loop steps + longest-chain ranks
```

- `admin-feature-edges-41e948ee4.txt` — 219 direct cross-feature import sites, 80 pairs (77 with a value import, 3 type-only). `[T]` = type-only.
- `admin-shared-detours-41e948ee4.txt` — feature → `lib|hooks|components|admin-themes|integrations` → other feature paths (first hop shown).
- `admin-shared-to-feature-imports-41e948ee4.txt` — the 63 shared files / 108 sites that import a feature directly (the detour baseline for rule `admin-shared-no-feature`).
- `post-loop-remaining-edges-and-ranks.txt` — the 79 sites / 41 pairs left when only files holding an intra-loop edge are cut.
- `ratchet-start-edges-and-ranks.txt` — the 65 sites / 32 pairs left after every file the C/O/P steps rewrite is cut, plus the longest-chain rank per feature folder: the ratchet start for `admin-feature-rank:*` and the pair allowlist.

The scanner's regex reads static `import`/`export … from`, `import("…")` with a literal, and side-effect imports. One specifier stays unresolved (`lib/admin-http/request.ts:463 ../lib/api`, a comment example). Computed specifiers are not seen; the depcruise gate is the authority.
