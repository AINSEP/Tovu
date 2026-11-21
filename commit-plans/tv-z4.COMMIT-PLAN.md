# tv-z4 catch idioms handoff

Branch: `codex/tv-z4`. Base for every sheet: merge-6, `776ce6d0f0cd88072f38d352ff99bef7c342d25d`.
All source paths below are relative to `apps/website/src/`; each ledger key is `(apps/website/src/<path>, catch-reads-error)`.
Reductions are expected, not gate measurements. Total expected reduction: 18; C08's two findings remain.
No commits or staging performed; `.git` is read-only for this dispatch.

## C01 — DONE

Files touched / ledger reductions:

- `platform/markdown/frontmatter.ts`: -1 (C334).
- `server/runtime/composition/build-release.ts`: -1 (C443).

Combine mutation owed: restore each original catch. Witness: malformed frontmatter retains regex fallback and downstream validation; unreadable build metadata remains `{}`.
Tests added/changed: none; no bug-sheet test names or red reason apply. Chrome/Electron look owed: none (culled).
Diff re-read deletions: none beyond the specified catch replacement, including its obsolete parsed-value initializer.

## C02 — DONE

Files touched / ledger reductions:

- `platform/site-dir/local-admin-bundle.ts`: -1 (C346).
- `platform/site-dir/nested-sites-root.ts`: -2 (C349).
- `platform/site-dir/local-site-child.ts`: -1 (C347).
- `platform/site-dir/read-site-dir.ts`: -2 (C350).
- `platform/site-dir/site-registry.ts`: -1 (C357).

Combine mutation owed: restore each original catch. Witness: marker read stays within the lock; incomplete discovery candidates skip; required admission remains unchanged.
`platform/site-dir/site-registry.ts` is 564 lines; the file-size rule permits continuing. No function extraction performed.
Tests added/changed: none; no bug-sheet test names or red reason apply. Chrome/Electron look owed: none (culled).
Diff re-read deletions: none beyond the specified catch replacements.

## C03 — DONE

Files touched / ledger reductions:

- `server/inbound/admin-http/admin-static.ts`: -1 (C359).
- `server/inbound/admin-http/sea-runtime.ts`: -1 (C386).

Combine mutation owed: restore each original catch. Witness: asset header/write order and static fallback ownership remain; the synchronous require directive stays beside the require line. Existing cast retained verbatim.
Tests added/changed: none; no bug-sheet test names or red reason apply. Chrome/Electron look owed: none (culled).
Diff re-read deletions: none beyond the specified catch replacements.

## C04 — DONE

Files touched / ledger reductions:

- `server/inbound/admin-http/routes/pages/get-by-id.ts`: -1 (C370).
- `server/inbound/admin-http/routes/posts/template-preview.ts`: -1 (C372).
- `server/inbound/admin-http/routes/widgets/agent-tools.ts`: -1 (C385).

Combine mutations owed: restore catalog/status catches; move shape validation back inside the pending-body parse try. Witness: page reply ownership, saved-body fallback for malformed JSON, and widget existence reporting remain unchanged. Catalog port invocation is evaluated before wrapping its returned promise, preserving synchronous failure behavior.
Tests added/changed: none; no bug-sheet test names or red reason apply. Chrome/Electron look owed: none (culled).
Diff re-read deletions: none beyond the named replacements and parse-only try adjustment.

## C05 — DONE

Files touched / ledger reductions:

- `server/inbound/admin-http/routes/plugins/provider-settings.ts`: -1 (C371).
- `server/inbound/public-http/routes/site/pages/render-context/site-title.ts`: -1 (C424).

Combine mutation owed: restore each original catch. Witness: legacy credential guard, marker-before-value order, and authored fallback remain. Injected calls are evaluated in the same branch before wrapping their returned promises.
Tests added/changed: none; no bug-sheet test names or red reason apply. Chrome/Electron look owed: none (culled).
Diff re-read deletions: none beyond the specified catch replacements.

## C07 — DONE

Files touched / ledger reductions:

- `server/inbound/public-http/routes/members/me.ts`: -1 (C409).
- `server/inbound/public-http/routes/site/product-checkout.ts`: -1 (C425).

Combine mutation owed: restore each original catch. Witness: provider IDs remain fallback labels and unlink stays available; both URL guards and slug encoding remain within the synchronous fallback boundary. Provider-list invocation is evaluated before wrapping its returned promise.
Tests added/changed: none; no bug-sheet test names or red reason apply. Chrome/Electron look owed: none (culled).
Diff re-read deletions: none beyond the specified catch replacements.

## C08 — STOPPED

Stop: `server/runtime/composition/site-deps/identity-settings.ts:51`, `composeIdentitySettings`, spans lines 51–123 (73 physical lines), exceeding the sheet's 50-line function cap before editing. The dispatch forbids an unlisted extraction or comment removal to meet the cap. Both sheet files remain unchanged; no promise consumers receive a replacement promise.

Files touched: none. Ledger keys retained:

- `server/runtime/composition/memory-deps/slices/site-title-settings.ts` (C447): reduction 0; planned -1 deferred.
- `server/runtime/composition/site-deps/identity-settings.ts` (C475): reduction 0; planned -1 deferred.

Combine mutation: no local mutation owed for this stopped sheet. If re-dispatched, restore detached catches for the gate mutation and substitute a settlement promise for `siteTitleReady` for the readiness witness mutation.
Tests added/changed: none; no bug-sheet test names or red reason apply. Chrome/Electron look owed: none (culled).
Diff re-read deletions: none.

## Verification boundary

Reviewed the source diff against the named edits, fallback boundaries, comments, call ordering, and guards. No tests, builds, installs, type checks, linters, gate invocation, debt update, package/lock changes, Jini edits, or subagents. No importer repoints; see `REFRESH.md`. Combine owns executable validation, gate mutations/counts, and any authorized `--update` after zero New/Worse lines.
