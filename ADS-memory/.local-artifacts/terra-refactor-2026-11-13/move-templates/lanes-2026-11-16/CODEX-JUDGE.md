Software Architect / Refactor(Review): **Verdict: needs rework.**

The READY sheets still contain missing bindings, incorrect inventories, incompatible target boundaries, and instructions that prevent verification of their own green-commit requirement.

Evidence below uses:

- **Design paths** relative to `move-templates/lanes-2026-11-16/` on `plan/lanes-k-t-2026-11-16`.
- **F/** = `apps/website/src/features/` in Tovu’s specified `refactor/terra` ref.
- **Jini paths** from its specified `refactor/terra` ref.
- Explicit **size-04/05** labels where those refs were inspected.

No files were edited and no builds or tests were run. The supplied lessons, fetched lessons file, and local lessons file all end at **26**; I could not verify or apply the unspecified lessons 27–31.

## Findings

1. **Blocker — The assembled instructions prohibit proving commits green.**

   **Evidence:** `K/K-TOOLS-PATTERN.md:25–39` requires independently green characterization and seam commits, including an observed RED mutation test. Shared `COMMON.md:9` forbids tests, typechecks, builds, installs, and linking; `COMMON.md:42` explicitly tolerates unresolved new Jini imports until later linking. `T-MOVE.md:70–71` postpones verification until a batched run.

   This cannot satisfy the requested independently compiling, passing intermediate commits. ESLint cannot establish that requirement.

   **Fix:** Give each run an explicit baseline and per-commit verification sequence, including package build/link prerequisites. Remove the contradictory prohibitions from its assembled brief.

2. **Blocker — K omits host-owned approval/search metadata and misses its existing binding mechanism.**

   **Evidence:** K-01 says “ports: none new” and claims its only Tovu import is `./agent-tools.js` (`K/K-01-redirects-tools.md:6`). Actual `F/redirects/tool-registrations.ts:1` imports host `toolMetadata`, then passes it at `:267`. Its tombstone confirmation policy lives in `contracts/core/tool-metadata/redirects.ts:67–78`. Forms, widgets, trash, and webhooks have the same dependency.

   An owner already exists: Jini `packages/core/src/tool-metadata.ts:18` defines `withToolMetadata`; Tovu `F/navigation/tool-registrations.ts:59` already applies it around reusable registrations. Pattern S4 (`K/K-TOOLS-PATTERN.md:45`) omits that binding.

   **Fix:** Preserve metadata ownership in Tovu using the existing wrapper. Characterize complete resulting descriptors, including approval metadata, through the host contributor.

3. **Blocker — K-10 mistakes policy-bearing forms wrappers for package re-exports.**

   **Evidence:** `K/K-10-forms-tools.md:5` directs the executor to check that three functions are re-exports and import Jini leaves. They are wrappers:

   - `F/forms/index.ts:94–96` injects permission and reserved slugs.
   - `:100–118` forwards authoring, notification, idempotency, and outbox options and preserves reserved-slug error details.
   - `:122–132` forwards update/status options.

   The tool handlers call these wrappers at `F/forms/tool-registrations.ts:358`, `:382`, and `:402`. Direct replacement would discard those bindings; respecting the sheet’s check instead stops a supposedly READY run.

   **Fix:** Specify typed host write ports or an equivalent complete package-options binding. Include reserved slug, authoring authorization, notification, outbox, and version-conflict characterization cases.

4. **Blocker — T-TH-01 classifies a filesystem write lifecycle as a pure universal leaf.**

   **Evidence:** `T/T-TH-theme.md:5–9` moves `page-publication.ts` into the universal theme entry with only B04 T1 required. Actual `F/theme/page-publication.ts:1–3` imports preview refresh, theme loading, and file operations; `:52–58` reads and writes `theme.json`, replaces the live theme, and refreshes previews.

   `font-links.ts` also has an unhandled runtime dependency. On **size-04**, `F/theme/font-links.ts:2,16` calls `publicThemeResources`; `F/theme/public-theme-resources.ts:1–4,28–35` owns filesystem access, product-root resolution, and a lazy cache.

   **Fix:** Separate pure rendering from host resource loading and publication effects. Specify synchronous read/write ordering, state ownership, required ports, runtime entries, and actual prerequisites before marking this runnable.

5. **Major — K-07 requires a Jini registry contract that does not exist and omits the generic trash path’s dependencies.**

   **Evidence:** `K/K-07-trash-tools.md:5` says `TrashRegistry` already exists in `@jini-ai/cms/trash`. It does not appear anywhere under Jini’s `packages/cms/src/trash`; its entry at `index.ts:1–7` exports no registry contract. Tovu owns that schema in `F/trash/registry.ts`.

   Moving `trash-item-tool.ts` additionally requires `TrashDb`, adapter constants, `readLiveSnapshot`, and `moveToTrash` (`F/trash/trash-item-tool.ts:60–70,358–369`). These are absent from K-07’s ports. The SQL read moves only in K-08; `move-to-trash.ts` is classified STAY.

   **Fix:** Land the required contracts first, inject the existing trash operation and snapshot reader, and explicitly retain host delegate policy. Supply the generic, delegated, and user-path acceptance tests.

6. **Major — The handler inventories contain nested callbacks and registration fields masquerading as tools.**

   **Evidence:** `K/K-01.decls.tsv` counts `handlers` at source lines 271–274 as a tool, producing eight handlers instead of the actual seven. `K/K-09.decls.tsv:33–37` treats `prepare`, `describe`, `run`, and `handlers` as separate tools and records the delete handler as one line. The real approval-wrapped handler spans `F/webhooks/tool-registrations.ts:309–359`.

   Comments and taxonomy inventories similarly count approval-wrapper callbacks. Yet S0 derives expected tool IDs from these rows, and S1 extracts in their order.

   **Fix:** Inventory actual registration keys separately from nested callbacks. Regenerate handler spans and literal ID expectations from validated syntax and cross-check against the catalog.

7. **Major — Several prescribed characterization assertions are wrong or cannot detect their stated risk.**

   **Evidence:**

   - Pattern S0 snapshots `sideEffect` (`K/K-TOOLS-PATTERN.md:29`); actual catalog entries use **`sideEffects`**, e.g. `F/redirects/agent-tools.ts:182`. The proposed snapshot omits that property.
   - K-09 forbids non-redacted values beneath `/secret|key|token/i` (`K/K-09-webhook-tools.md:10`), but existing public views intentionally return numeric `secretVersion` and `previousSecretVersion` (`F/webhooks/tool-registrations.ts:116–117`).
   - T-TH-03 requests card/compact and cover variants (`T/T-TH-theme.md:22`). Actual layouts are `cards`, `list`, `accordion`, and `carousel` (`F/theme/entry-list-render.ts:68`); `EntryListItem` has no cover field (`:37–43`).

   **Fix:** Write fixtures against the real contracts, distinguish secret material from version identifiers, and demonstrate failure on each named mutation.

8. **Major — K-06 does not specify the SQL schema migration it actually needs.**

   **Evidence:** `K/K-06-taxonomy-sql.md:5–7` describes replacing kernel/handle imports and copying a sibling constructor. Actual dependencies include generated `ContentDatabase` (`F/taxonomy/repo.ts:3`, `repo.rows.ts:3,13–14`) and workspace-scoped constructors (`repo.ts:68,186,355,524`). The sibling constructor is `{ kernel, tables }` (`packages/cms/src/redirects/sql/repo.ts:25–37`).

   Table names also occur inside qualified predicates and correlated subqueries (`F/taxonomy/repo.ts:48–57`), not only `.selectFrom("…")` calls.

   **Fix:** Specify local row/table schemas, all four constructor shapes including workspace scope, every table/column rewrite, and exact host construction updates. Copying the sibling’s lifecycle is insufficient.

9. **Major — Proposed target files still violate owner size limits; some stated splits do not address the real code.**

   **Evidence:** K-06 proposes a single 555-line `repo.ts`. K-07 moves a 518-line `trash-item-tool.ts` and splits a data table rather than defining a file partition. T-TH-02 moves a 548-line manifest module while only splitting one function. T-NL-02 moves a 644-line repository without a file split.

   K-01 prescribes moving schema constants out of `getRedirectsAgentToolCatalog` (`K/K-01-redirects-tools.md:4`), but those constants are already outside it (`F/redirects/agent-tools.ts:59–168`).

   **Fix:** Supply final file partitions and measured function/file/complexity acceptance results. Regenerate estimates after including that work.

10. **Major — T-PO-01 puts timer state and lifecycle effects into the prohibited core destination.**

    **Evidence:** `T/T-PO-post.md:5` moves all of `go-live.ts` into `cms/core` as a pure leaf. Actual `F/post/go-live.ts:147–184` owns timers, mutable sweep state, immediate execution, single-flight behavior, retries, and shutdown waiting. Shared `COMMON.md:37` expressly excludes I/O, state, and timers from core.

    Its test wording also needs precision: `announceDueGoLives` enqueues every candidate again (`:117–119`); deduplication belongs to the outbox contract.

    **Fix:** Separate pure go-live decisions/events from the sweep lifecycle, assign an allowed owner, and test retry windows, overlap suppression, shutdown waiting, and durable deduplication separately.

11. **Major — T-PO-01 misses the existing optimistic-concurrency implementation.**

    **Evidence:** `T/T-PO-post.md:5` proposes moving `expected-version.ts` beside core tool-input errors. Jini already owns `parseExpectedVersion` in `packages/core/src/optimistic-concurrency.ts:66–75`, exposed through its existing subpath.

    The implementations differ: Tovu uses `{ raw }`, `Number.isInteger`, and `PostValidationError` (`F/post/expected-version.ts:49–54`); Jini uses `{ value }`, `Number.isSafeInteger`, and `ToolInputError`.

    **Fix:** Reconcile those contracts through the existing owner and a host error adapter or explicit approved extension. Include unsafe-integer and error-class cases; do not introduce another parser.

12. **Major — Importer sheets remain based on deleted size-04 files and omit transitive barrel consumers.**

    **Evidence:** `T/T-TH-01.repoint.tsv:6,16` still targets `http/site/render.ts`. T-TH-03 targets both old `render.ts` and `routes/site/pages.ts`. On **size-04**, actual imports include:

    - `http/site/render/document-shell.ts:1,7,9`
    - `http/site/render/widgets/social-entries.ts:6`
    - `routes/site/pages/render-context/collection-lists.ts:3`

    These are listed separately in `SIZE04-importers.tsv`, not incorporated into executable edits.

    The census explicitly excludes barrel consumers. For example, T-PO-01 lists `post/index.ts`, but omits `routes/posts/update.ts:6,17`, which imports `parseExpectedVersion` through that barrel.

    **Fix:** Produce final symbol-level importer edits against the merged new shapes, including barrel consumers and signature adaptations. Delete moved re-exports in the same commit.

13. **Major — T-TH-03’s prefix option does not cover its actual compatibility surface.**

    **Evidence:** `T/T-TH-theme.md:20` proposes `classPrefix` and calls the slice READY despite unresolved D-T3. Actual compatibility includes `data-tovu-entry-list`, the exact style-opening sentinel, selectors, and style-insertion checks (`F/theme/entry-list-render.ts:83–108,334–348,369–374`).

    A class prefix alone leaves forbidden product text or mismatches the sentinel and CSS. The proposed goldens also omit custom-template escaping and listing continuation behavior (`:240–295,327–349`).

    **Fix:** Resolve the owner decision first. Specify the complete markup/style contract and test style insertion idempotency, template escaping, all layouts, empty fallback behavior, and listing sentinels.

14. **Major — K-09 leaves forbidden CMS imports in the integrations package.**

    **Evidence:** Actual `F/webhooks/tool-registrations.ts:21,27` imports permission functions and `ForbiddenError` from `@jini-ai/cms/core`. K-09’s port/import instructions do not replace them. Its shared STOP regex also does not include `cms`.

    Core already exports the permission mechanism and its error alias (`packages/core/src/index.ts:55–64`).

    **Fix:** Specify the legal core imports and preserve error identity. Add a comprehensive allowed-package import check rather than a partial deny-list.

15. **Major — Newsletter’s target runtime and security-sensitive handoffs remain unspecified.**

    **Evidence:** T-NL-01 builds on B05’s **universal** `cms/newsletter` entry. But `F/newsletter/confirmation.ts:10` imports Node crypto and directly hashes and mints tokens. The listed signing port covers unsubscribe signing, not these confirmation operations.

    The source’s binding constraint is also stronger than the proposed tests: consent must be requested/confirmed and return `granted` before subscription activation (`confirmation.ts:1–7` and `consumeConfirmationToken`). The sheet tests token expiry/reuse but does not pin that handoff.

    **Fix:** Define Node entry boundaries or complete token ports, plus sender-resolution, consent-denial, effect-order, and no-activation-on-failure tests.

16. **Major — A required export probe incorrectly rejects an export that already exists.**

    **Evidence:** `K/K-TOOLS-PATTERN.md:41–42` requires the literal `SurfaceExchangeStore` to appear in `packages/core/src/index.ts`. That index exports `./surface-exchanges.js` through `export *` at line 18, so the specified probe fails despite the type being exported.

    **Fix:** Verify the export chain or compile a minimal public-import contract. Resolve this before dispatching surfaces-dependent READY sheets.

17. **Major — This remains a partial design package, not the requested set of self-contained executor sheets.**

    **Evidence:** `INDEX.md:81–87` leaves admin screens, five designs, five outlines, and classification of 392 tests unfinished. K-10 explicitly contains two runs; the T documents combine multiple runs with different prerequisites. K-03 introduces settings ports without supplying their complete typed binding, while shared S4 simply forwards the original deps object.

    The requested STOP coverage is also incomplete: T-UI lacks an explicit all-locales check and hook checks covering `useT`/`useAdminLocale`; no assembled prohibition scans new suppressions or cross-package mocks. Visual notes exist, but the admin moves themselves are unsheeted.

    **Fix:** Split one run per independently executable sheet, supply complete bindings and test dispositions, and add the requested validation/STOP matrix. Keep unresolved work explicitly non-dispatchable.

18. **Minor — Inventory descriptions and source counts are stale or misleading.**

    **Evidence:** `INDEX.md:77` says 233 source files; the supplied inventories contain **125 K + 115 T = 240**. K inventory line 43 calls `taxonomy/render-entry.ts` a thin forwarder/binding, but `F/taxonomy/render-entry.ts:10–38` contains the renderer and cycle handling. K-11 says the destinations registry stays, although its pure `buildFormDestinationRegistry` and `dropShared` implementations remain identifiable (`F/form-destinations/registry.ts:59–97`).

    **Fix:** Regenerate counts and separate genuine host bindings from retained generic implementations. Give any deferred generic portion an explicit execution owner.

## Sampling and overlap checks

I checked **21 inventory rows** against source, including declaration/import contracts. Every sampled LOC value and blob matched `refactor/terra`; matching blobs did not validate the classifications.

| Sample under F/ | Inventory label | Review result |
|---|---|---|
| redirects/agent-tools.ts | MOVE | Seven tools; inventory adds a false eighth |
| redirects/tool-registrations.ts | SPLIT | Missing metadata binding |
| widgets/media-html.ts | SPLIT | Existing render/report seams confirmed |
| comments/public-markers.ts | STAY | Contains rendering and consent-script behavior |
| taxonomy/repo.ts | MOVE | Schema/scoping work underspecified |
| taxonomy/repo.rows.ts | MOVE | Generated database-type dependency |
| taxonomy/render-entry.ts | STAY | Renderer, not forwarder |
| trash/agent-tools.ts | MOVE | Host permission/registry dependencies |
| trash/tool-registrations.ts | SPLIT | Required registry contract absent in Jini |
| trash/trash-item-tool.ts | MOVE | Additional host/SQL dependencies |
| forms/index.ts | STAY | Policy-bearing wrappers |
| forms/tool-registrations.ts | SPLIT | Depends on those wrappers |
| form-destinations/registry.ts | MOVE-AFTER | Pure registry functions plus host loader |
| theme/font-links.ts | MOVE | Host resource-loader dependency |
| theme/token-aliases.ts | MOVE | Fixed alias lookup; no recursive alias-chain mechanism |
| theme/page-publication.ts | MOVE | Filesystem mutation and live-state refresh |
| theme/render-contract.ts | SPLIT | Types plus URL policy |
| post/cover-image.ts | SPLIT | Selection and body-projection contracts |
| post/expected-version.ts | MOVE | Existing Jini owner missed |
| post/go-live.ts | MOVE | Includes timer lifecycle |
| newsletter/send-pipeline.ts | MOVE-AFTER | Effectful orchestration |

For the separate **ten-file overlap sample**, I checked all seven `moves/*` refs and all five available `plan/audit2-sheets-*` refs:

| Sample | CLASSIFY-files.tsv line |
|---|---:|
| redirects/agent-tools.ts | 878 |
| widgets/media-html.ts | 1020 |
| comments/tool-registrations.ts | 612 |
| taxonomy/repo.ts | 951 |
| trash/trash-item-tool.ts | 990 |
| webhooks/tool-registrations.ts | Absent |
| forms/tool-registrations.ts | 707 |
| theme/page-publication.ts | Absent |
| post/cover-image.ts | 827 |
| newsletter/send-pipeline.ts | 797 |

None of those ten files was moved by the seven move branches or listed as a moved-file member of the available audit2 sheets. B05 mentions `send-pipeline` as a retained consumer. **Eight of ten already have CLASSIFY labels**; these are existing planning inputs, not evidence of completed extraction. Full “nothing dropped” acceptance cannot pass while the explicitly unfinished scope in finding 17 remains.

## Recurring mistake classes

No additional classes established beyond lessons 1–26. Lessons 27–31 were unavailable, so I cannot responsibly claim a proposed class is new relative to them.
