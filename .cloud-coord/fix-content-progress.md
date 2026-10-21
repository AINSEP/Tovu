# fix2-scheduled progress (2026-10-21)
- F1 HIGH go-live id collides with legacy save-time id: fixed — id is `${id}-entry.published-at-${publishAt}`
- F2 HIGH enqueue after commit loses event: fixed — create/update/delete/retire/restore-forward/import emit inside the write transaction
- F3 HIGH edit straddling go-live double-fires: fixed — same publication id across versions (PG overlap: LOCAL-RUN NEEDED)
- F4 HIGH reverters announce scheduled posts early: in progress
- F5 HIGH HTML page edits erase pending announcements: in progress
- F6 MEDIUM missing optionalObj param: fixed (port + both repos)
