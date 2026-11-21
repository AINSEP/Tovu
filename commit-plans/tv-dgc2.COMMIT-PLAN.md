# COMMIT-PLAN

## V3 — Stop a cancelled theme URL import at the writer

- Status: implemented; runtime verification and mutations owed to combine. V3 only; base job's completed sheets unchanged.
- Base: `codex/tv-dgc2`, `45f44c2d9a7657bf04f30896805f4a2283e3a02c`.
- Files: `apps/website/src/features/theme/__tests__/theme-file-safety.test.ts`, `apps/website/src/features/theme/import-theme-file-tool.ts`, `apps/website/src/features/theme/theme-file-import.ts`, `apps/website/src/features/media-import/fetch-image.ts`, root `COMMIT-PLAN.md` and `REFRESH.md`.
- Test first: exposed the existing fixture controller and added the held-download cancellation witness before production edits. The fake client returns valid replacement bytes after cancellation; assertions require the original abort reason, identical outgoing signal, original destination bytes, and no revision. On the base, the signal is absent and the replacement proceeds, so rejection is expected to fail. RED is inferred from source, not executed.
- Control: cancellation immediately after the synchronous destination rename must retain a successful result and replacement bytes. This pins existing committed-write behavior and is expected to pass on the base; it is not a second bug reproduction.
- Mutation owed to combine: independently remove conditional signal forwarding in `fetchImage`, then remove `signal?.throwIfAborted()` immediately before `persistThemeImport`. The first must fail signal identity; the second must fail abort rejection and allow an unwanted replacement/revision. Run the named witness and committed control with the linked candidate.
- API-baseline delta (Jini): none; additive signal options affect Tovu functions only. The host checkout's `@jini-ai/core` 0.7.2 `dist/primitives/http.d.ts` and Jini source both declare `HttpRequest.signal?: AbortSignal`. This private clone has no installed dependencies; candidate linking remains with combine.
- Look owed: none.
- Source review: persistence remains synchronous after the final check. Existing guarded client, deadline, byte policy, imports, argument conventions, and all `_optional`/`_options` pads remain unchanged. Changed functions and test callbacks stay within 50 lines and complexity 10 by manual review. No touched file exceeds 500 lines.
- Diff re-read deletions: none; no out-of-scope additions identified.
- Verification: no tests, builds, installs, type-checks, linters, or graph scans run, per dispatch. Only targeted symbol importer lookups and scoped base/source comparison used; no commits or other Git writes.
