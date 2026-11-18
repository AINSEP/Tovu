# S2 — tools and tests that read `deps.ts` text learn the `site-deps/` tree (no move yet)

Responsibility: source readers only, so S3-S13 never break them silently (lesson 45). Budget ≤60k. Commits: 1-2.
Prerequisites: S1. COMMON §2, §3.

## Files and edits
- `development/scripts/check-capability-inventory.ts:19-20` (`DEPS_SOURCE`): read `deps.ts` **plus** every `.ts` under `composition/site-deps/` if the folder exists (sorted, concatenated). Messages that say `deps.ts|app.ts` keep their text.
- `apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts:168` (`compositionReferences(deps.ts, app.ts)`): pass the same concatenated text for `deps.ts`.
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts:164`: add the prefix `server/runtime/composition/site-deps/` to the forbidden list beside `deps.ts`.
- `development/scripts/__tests__/dependency-cruiser.test.ts:29`: read what the list is for; if it lists composition roots, add `server/runtime/composition/site-deps/` the same way; if it is a fixture of cruiser output, leave it and say so.
Red-first: for each edited reader, plant a capability/forbidden import in a throwaway `site-deps/planted.ts`, show the reader now fails, delete the plant.

## STOP
```bash
npm run check:inventory | tail -1 | grep -q 'OK' || echo "STOP: inventory not OK on an unmoved tree"
test -e apps/website/src/server/runtime/composition/site-deps/planted.ts && echo "STOP: plant left behind"
```
Gates: COMMON §5.
