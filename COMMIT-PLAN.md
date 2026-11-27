# Merge-27 test contract repair

Leave this file uncommitted. The entries below are the coordinator's commit order. No tests, typechecks, builds, installs, or linters ran. No tests were added, deleted, or skipped. Mutations are review probes for the cloud run and were not applied.

## 1. Bind the publish characterization tests to Jini

Paths relative to `apps/website/src`:

- `features/navigation/__tests__/publish-content.characterization.test.ts`
- `features/navigation/__tests__/publish-content.test.ts`
- `features/navigation/__tests__/reverters.test.ts`
- `features/entries/__tests__/unit/publish-content.test.ts`
- `features/taxonomy/__tests__/publish-content.test.ts`
- `server/runtime/composition/publish-content-manifest.ts`

Mutations:

- Contributor construction: stop passing the real repo-handler factory. The existing pack, inspect, precheck, apply, repoint, and revert cases should fail before exercising their assertions.
- Menu characterization: hash one fewer field; include a trashed row; return the wrong inspected version; accept an invalid tree or stale version; generate a new menu ID or leave the saved version unchanged. Existing pins check each outcome.
- Menu pack and apply: strip `lastKnownHref`, accept a held slug, drop the exact validation detail, reject dangling entry references, ignore binding displacement, skip restoring the prior binding on rollback, or write without an outbox. The corresponding checks read exact content, reasons, identities, and stored binding state.
- Menu reference repair: skip nested targets, rewrite a URL target, drop the apply actor's kind, ignore skip IDs, create a second change set on replay, skip authorization, over-retry, retry stale state, stop after a denied menu, or omit the compensation write. Missing-port and vanished/already-fixed cases pin refusal or no-op separately.
- Menu revert: skip restoring the inverse tree or allow a revert after a newer version. The latter must also leave the newer title, version, and tree intact.
- Collection entries: remove `adaptLegacyAuthorize` from the import re-check (the existing named regression), include the widget or trash rows, stop sorting/syncing term IDs, drop the untagged entry, allow a held slug or stale write, accept a widget type, ignore the tombstoned owner, refuse the late-arriving owner, invent `publishedAt`, or omit the owner/term references.
- Taxonomy and terms: swap dependency order, ignore a reparent, allow a trashed or same-named holder, accept the stale plan, or substitute actor kind. Existing exact outcomes and readbacks must fail.

## 2. Supply trusted actors to entry write fixtures

Paths relative to `apps/website/src/features/entries/__tests__`:

- `integration/repo.compare-and-set.postgres.test.ts`
- `integration/repo.compare-and-set.test.ts`
- `integration/repo.dialects.test.ts`
- `integration/repo.sqlite.integration.test.ts`
- `unit/trash-aware-memory-repo.display.unit.test.ts`

Mutations: omit the trusted actor to reproduce the fixture rejection. At the behavior seam, allow both CAS writes to win, append a revision or event for the loser, skip the rollback after `onWritten` rejects, reserve the wrong slug, expose trashed rows, or change a typed display value. The tests retain their real repository or persisted-row checks and conflict assertions.

## 3. Update site backup and share fixtures

Paths relative to `apps/website/src/features/site-backup/__tests__`:

- `import-history-index.fixture.ts` — return a non-ok SQLite quick check and confirm indexed history is refused.
- `import-history-mode.integration.test.ts` — move the row write or witness ahead of the failing state publish.
- `import-registry-notices.unit.test.ts` — change the production upload metadata store's prefix or busy sentence. The exact copy at that binding should fail.
- `import-verifier-refusals.unit.test.ts` — admit a refused document instead of reporting its pinned reason. The host admission function remains real.
- `library-share.integration.test.ts` — expose a private document via its public rendition or omit its restored bytes.
- `share-backend.unit.test.ts` — accept peers or object storage as expiry hosts, drop the own-folder choices, or propagate a delivery lookup failure while listing.
- `share-database-search-config.integration.test.ts` — use a different search configuration, skip rebuilding the search row, or copy the private table or marker.
- `share-expiry.unit.test.ts` — invent a default date, accept a remote expiry, admit a link at the expiry instant, delete the archive, skip persisting the date, or start a job before refusing the choice.
- `static-export-themes.integration.test.ts` — omit `createHash` to reproduce fixture failure, or drop the rendered media asset from the static export.
- `tool-registrations.unit.test.ts` — invoke a share backend action before checking permission, bypass the backend, or pass the wrong format or principal.

## 4. Update the SQL and member lane pins

Paths relative to `apps/website/src/__tests__/lane-su-pins`:

- `p1b-lock-keys-media-trash-members.test.ts` — remove the user Trash lock or key it by the wrong workspace/principal.
- `p2-member-one-lock.test.ts` — let password persistence, session save/revocation, or Trash use a different member lock.
- `p5ab-member-bearer-digest.test.ts` — use a raw bearer or wrong digest, swap workspaces at lookup, or stop storing the issued session in the repo.
- `p6-p7-table-and-kind-shapes.typecheck.ts` — delete one pinned migrated column or add an unrelated one. Exact column equality remains required, and the kind pins are unchanged.

## 5. Align external MCP fixtures

Paths relative to `apps/website/src/features/external-mcp/__tests__`:

- `external-mcp-aad-writer-sync.test.ts` — write an OAuth payload without keeping its version in step with the envelope.
- `external-mcp-aad.test.ts` — let the ordinary read path accept a legacy unnormalized envelope. The existing rejection remains the oracle.
- `external-mcp-oauth.test.ts` — do not delegate active-key lookup after the injected transient failure. The recovery case should fail.

## 6. Update newsletter and SEO tests

Paths relative to `apps/website/src/features`:

- `newsletter/__tests__/delivery-tools.test.ts` — look up a different owner, send to a caller-supplied recipient, or accept blank/unset email. The exact recipient and refusal assertions remain.
- `newsletter/__tests__/http-error-responses.cutover.test.ts` — route a known conflict through the incident reporter, omit the unknown failure's incident, or return an ID that doesn't match the record.
- `seo/__tests__/sitemap-invalidation.integration.test.ts` — drop any pinned entry lifecycle subscription, or rebuild the sitemap for an untouched draft.

## Quality findings and diff review

- Navigation characterization / pack (**F1.6, F6.1**, fixed) compares both live menu states by ID. Navigation publish / page reference pack (**F1.6**, fixed) selects the known footer. The precheck slug assertion intentionally accepts the two documented presentation forms, while still pinning the slug and holder (**F1.1**, left).
- Navigation revert / stale version (**F6.3**, fixed) reads back the newer edited row after the rejection.
- Entry publish / no terms (**F5.2**, fixed) first proves the untagged entry was packed. Widget apply refusal has a real matching actor so the fixture doesn't depend on a second refusal (**F4.4**, fixed).
- Import registry / timeout copy (**F2.4, F6.1**, fixed) drives the real composed upload and observes the exact metadata store's notices. Actual lock contention is outside this copy pin.
- Share database / search rebuild (**F1.2**, fixed) checks the persisted projection row rather than table presence. The callback recorder still invokes the production backfill.
- Share expiry / own folder and owner clock (**F1.2, F3.6, F4.1, F6.3**, fixed) checks token identity, uses a key/size-aware store, pins copy independently, and reads the persisted expiry.
- Member digest / lookup and round trip (**F3.3, F3.6**, fixed) delegates to real in-memory repositories and records exact workspace and digest.
- External MCP / legacy-envelope rejection (**F7.6**, fixed) uses fixed fixture key material without changing process environment.
- Newsletter / owner email and route failure (**F3.6**, fixed) checks lookup scope and correlates the HTTP response with the real reporter's incident.

Deleted/replaced obsolete code only: the duplicate OAuth import, obsolete host type imports and expiry argument, fixture-local registry wiring, the legacy newsletter tracker/console stub, the environment-key mutation, the member repository stubs, and the casts or synthetic dependency values replaced by real ports. No unrelated code was removed.

Jini contract notes: `SiteShareRegistryLike.get` expects missing to be `undefined` while the concrete registry returns `null`. The tool test uses the narrower unused registry-port fake. `SiteShareBackend.hasWork` is optional in the interface but present on the real backend. The assertion still fails if the method is absent. The import registry's published private payload type need not contextual-type a fixture because the test now exercises the production binding.
