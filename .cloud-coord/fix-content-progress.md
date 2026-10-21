# fix2-scheduled progress (2026-10-21)
- F1 HIGH go-live id collides with legacy save-time id: fixed (fdd0c32f) — id is `${id}-entry.published-at-${publishAt}`; regression seeds a delivered legacy event
- F2 HIGH enqueue after commit loses event: fixed (fdd0c32f) — create/update/delete/retire/restore-forward/import emit inside the write transaction; enqueue-failure + restart-sweep tests
- F3 HIGH edit straddling go-live double-fires: fixed (fdd0c32f) — one id per scheduled publication across versions; overlap simulated with a fake candidates port (real PG: LOCAL-RUN NEEDED)
- F4 HIGH reverters announce scheduled posts early: fixed (71e0e619) — both reverters use exported emitPublicTransitionEvent inside postRepo.transaction (still raw save, no before-save hooks); tests drive revertChangeSet
- F5 HIGH HTML page edits erase pending announcements: fixed (3f27b4eb) — SQL + in-memory HTML stores announce a pending go-live inside the write transaction (deps.ts/app.ts pass the outbox); sqlite + pglite tests
- F6 MEDIUM missing optionalObj param: fixed (fdd0c32f) — port + both repos
- Open: peer-site-reads.ts builds PagesHtmlDocumentStore without an outbox (peer writes get no go-live catch-up); first boot after deploy announces every historic scheduled post still matching publishAt > updatedAt once (new id) — owner call
