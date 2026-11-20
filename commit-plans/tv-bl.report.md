All four sheets are done on `codex/tv-bl`; none stopped.

- **S7a-T:** Confirmed the three Jini exports, repointed the named callers/tests, deleted both Tovu copies and their forwarding exports, and updated the schema comment.
- **L08-types:** Changed only `media/access-evidence.ts` and `media/where-used.ts`; runtime statements remain unchanged.
- **L15-entries:** Updated the site-dir entry, three production consumers, and one additional test importer.
- **L15-members:** Moved the mapper and comment verbatim into `members/ports.ts`, restated the source type, and updated the tool, public-entry, and route imports.

[COMMIT-PLAN.md](SCR/c-tv-bl/COMMIT-PLAN.md) contains one entry per sheet, complete file lists, deletions, oversized-file notes, and combine checks.

[REFRESH.md](SCR/c-tv-bl/REFRESH.md) records the additional `local-sites.pins.unit.test.ts` import repoint.

`git diff --check` passed. No tests, builds, installs, type checks, linters, or Git writes ran.

Combine still owes the named guard/source-CAS/version/duplicate-ID/slug/access-evidence/export/principal/mailer mutations, targeted suites, boundary/architecture and worker checks, plus Chrome verification of public rendition freshness, file replacement, local-site boot, and archive validation.
