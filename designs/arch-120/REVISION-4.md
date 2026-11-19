# arch-120 — revision 4 (answers CODEX-JUDGE-3, REJECT; carries judges 1–2 forward)

Base: Tovu `integ/merge-3-2026-11-18` @ `2d82735a`, Jini @ `d37821a4`. Index: [`INDEX-v4.md`](INDEX-v4.md).
Sheets: [`v4/`](v4/). The lane partition and the 115-edge set are unchanged from v3
(`v4/edges/` is a copy of `v3/edges/`).

## 0. Two kinds of change

**(A) Gates were redesigned, not patched.** Every revision so far has failed on the same class of
finding: a bespoke shell gate that could pass on failure (rev1 `sheet-gates.sh`, rev2 Gate G, v3
G2/G3 `test -z "$(comm …)"`). The owner's rule is that a repeated finding class means the design
changes. v4 therefore deletes every bespoke gate: G1–G5, G-RATCHET, the `comm` pipelines, the
`test -z` wrappers, `$LANE`/`$SUITES` and all output parsing. INDEX-v4 has one short gate: run the
repo's own commands on the parent commit and on the candidate. PASS means every exit status is no
worse, and a plain diff of the two `check:architecture` and `check:boundaries` outputs shows no
error line that is new on the candidate. Lane edges and named boundary errors must be gone, and
there must be no new suppressions and no lost tests. The Codex executor runs nothing. An Opus
cloud test-and-fix run is the verifier. Each sheet keeps only the files to change, the callers and
tests to repoint, the tests to add, STOP conditions and expected removals. L00 states the
115-edge set and the 124-row prune as data.

**(B) Behaviour findings were fixed in the sheets,** each per the judge's Fix column and the
coordinator's decisions: F8 keeps the cache in media, L15 is in scope, and the L14 bag goes to
composition. Nothing was added that an edge removal does not need. The only new files are L07's
`static-download-html.ts` and `platform/html/source-edits.ts`, which share verbatim code instead
of threading 4 hops of wiring, and the `contracts/core` files the D moves already planned.

## 1. CODEX-JUDGE-3 (Codex 6.2, REJECT)

| ID | sev | finding (short) | v4 fix | where |
|---|---|---|---|---|
| F1 | blocker | G2/G3 hide failed `comm` inside `test -z`; status tests continue; L00 must assert 115 edges and 124 deletions | All bespoke gates deleted (§0 A). Gate = repo commands on parent and candidate, exit status no worse, plain diff of error lines (verifier). L00 states the 115-edge set (`v4/edges/all-115.txt`, partition) and the exact prune as data: 426 → 302 rows, numstat `0 124`, other keys untouched, STOP if counts differ | INDEX-v4 § Gate; `v4/L00` |
| F2 | major | `$LANE` expanded under `set -u` before assignment; G4 only checks size and complexity | No shell variables remain. The gate adds `check:hooks` and `check:why-comments`, and the verifier's diff review covers caps, suppressions, comment retention and test count (criterion 4). Setup is one paragraph per checkout | INDEX-v4 § Gate |
| F3 | major | L01 leaves forwarders with users; overstates dry-run suites | Forwarders are now deterministic: the 2 with zero remaining importers (`ApiConnectionConnectStatus`, `ExternalMcpConnectStart`) are deleted, and the others are kept and named with their importer counts. The dry-run claim is corrected to 5 of 8 suites, and the verifier runs all 8 | `v4/L01` |
| F4 | major | L04 theme binding implicit; site-search writer shared with L10 | Theme binding pinned (`tool-catalog-manifest.ts:643` via the tool-deps `set`; fixture `preview-switcher.integration.test.ts:90,99,113` unchanged). Site-search writer: exact input, result and rejection order (`isSearchProviderId` before `writeSetting`), binding at `modules/site-search.ts:439`, fixtures `settings.test.ts:38,47`. L04 merges before L10 | `v4/L04`, INDEX order |
| F5 | major | `project-scope.ts:1` still imports webhooks; positional APIs; run-ops fallback, override and per-call sources | L05 repoints `project-scope.ts:1` to `@jini-ai/integrations/webhooks`. Signatures move verbatim: the migration list is "none", stated explicitly. run-ops binds the **four existing functions** unchanged (`siteKeyOps`); the sha256 fallback, the `readSiteKey` override, per-call `env`/`homedir`/`cwd` and precedence are all preserved | `v4/L05` |
| F6 | blocker | Validator move recreates the custom-credentials edge; its unit test missing | The validator is not moved. `bindSourceControlWritePort` takes the original `validateRepositoryTarget` as a required field, read lazily inside the closure. Composition passes it from `custom-credentials/index.ts`, the legal entry. The error is still `CustomCredentialValidationError`. All 7 test call sites are listed, `write-files-validation.unit.test.ts` is kept, and lazy-binding and error-identity cases are added | `v4/L06` |
| F7 | blocker | Characterization expected a WebMCP script; export disables injection | The export path is characterized as **disabled**: no `data-tovu-webmcp-script`, none of the 5 tool attributes, and form/base rewrites unchanged (exact compare). `injectPublishedWebMcp` reaches `exportHtml` through a required `removeWebMcp`, bound in both roots. The download transforms move to their only production user (H), with the parse helpers shared through `platform/html/source-edits.ts`, so there is no transitive wiring | `v4/L07` |
| F8 | blocker | Contracts move violates decision; two WeakMaps; generation preview could drop | **Coordinator decision applied:** the cache stays in `features/media/access-evidence.ts` (both WeakMaps unchanged). Repos get the invalidate port (`onWriteSettled`, the shape Jini's `SqlEntryRepo` already takes), called at the same 10 lines and under the same conditions, synchronously. The rendition route gets the read port (`mediaAccessEvidenceCache`). Every production construction site in both roots binds the port, by name and line. `chat-preview.ts` (pure) moves to `contracts/core` instead of becoming an optional dep, so generation always previews. Tests cover pending scans, linked widget caches, synchronous clearing and the preview | `v4/L08` |
| F9 | major | L09 `find(themeId)` hides `findThemeOrThrow`; constants destination; L10 registrar `PostRecord`; push-plan | The port members are the theme functions under their own names and signatures (`findThemeOrThrow({ routeDeps, themeId })`, which throws). Constants go to `contracts/core/theme-ids.ts`, matching the INDEX budget. L10 migrates the registrar (`capability-tool-registrations.ts:17,75` → `PluginPreviewPost`). `PushPlanPost` is derived from `entryPublicPath`'s parameter | `v4/L09`, `v4/L10` |
| F10 | major | Restore catalog comes from the staging lifecycle; member login has 5 ops | `findSoonPlugin` is injected unbound, and the call site keeps passing `lifecycle.soonCatalog` of the per-restore lifecycle. The chain is `site-portability.ts:6` → `restoreStagedImport` → `restoreImportedPluginState`, with 4 test callers listed. The members port has **five** operations, including `requestSignInLink`. The `LOGIN_UNAVAILABLE` translation, proof mapping and deferred-notification order are all preserved | `v4/L11`, `v4/L12` |
| F11 | blocker | Negative case removes optional member; nested `p.terms`; shared slice; fallback hooks; generic callers | The bag stays in composition. Engine default is `object`, so readers must name a slice and pass-through code is unchanged. Every generic caller is listed (11 server/composition files name `TovuPublishPorts`, 10 engine files unchanged, test fixtures listed). The nested term shape is `TermSyncPort {read, prepare}`, built once per taxonomy object in `buildContentPublishPorts` and shared by `collection-entry.terms` and the top-level `termSync`. Post's absent-ports behaviour is kept byte-for-byte. The negative type-pins use **required** members (`post.repo`, `terms.prepare`, the apply bag's `media`). The fallback's hook override is pinned by a test | `v4/L14` |
| F12 | major | L15 leaves alternatives and caller lists open; 10 non-feature errors | L15 is in scope (coordinator). The report's non-feature errors are accounted for: 9 in L15 and the `media-rendition` one in L08. Each of the 9 has one mandatory fix with exact module, binding, callers, tests and STOP. No alternatives remain | `v4/L15` |
| Dispatch | — | Reject published waves; overlaps L03/L10, L04/L10, L06/L14, L12/L15 | A single merge order, with L02 ∥ L13 the only parallel pair. L15 no longer touches `composition/modules/members.ts` | INDEX-v4 § Lanes |
| (J1 leftover) | minor | `edges.v3.tsv:104` has two `?missing` origins | Both resolve to `features/members/write-service.ts` (`members/index.ts:95-115` re-exports them from there). The tsv is kept as recorded evidence. L12's design does not depend on the origin column | this table |

## 2. CODEX-JUDGE-2 (carried forward; judge 3's status in brackets)

| # | finding | v4 status |
|---|---|---|
| 1 | Waivers; E085/N083, N054–N055, N065 unplanned [waivers removed; restore binding open] | No waivers. E085/N083 restore binding fixed (F10) |
| 2 | Gate G fails open; TAP [intermediate gates open] | Bespoke gates deleted (F1). Final acceptance uses the runner's own status for `test:ci` and `check:test-baseline` |
| 3 | Publish bag incomplete [destination fixed; migration and negative case open] | F11: complete generic migration map, required-member negatives |
| 4 | Credential invalidation [resolved] | Unchanged: `publishCompatibility` port intact (L05) |
| 5 | No green integration state [architecture base qualified; boundary closure open] | L15 in scope. All 14 boundary errors are assigned (L06 1, L08 4, L15 9). Final acceptance needs both commands to exit 0 |
| 6 | Media access [unresolved under port design] | F8 port design as decided |
| 7 | Type ownership [preview migration open] | F9: registrar migrated to `PluginPreviewPost` |
| 8 | Dispatch [setup and overlaps open] | Setup has no variables. Overlaps are resolved by merge order |

## 3. CODEX-JUDGE-1 (carried forward)

| finding | v4 status |
|---|---|
| Baseline refs, inventory drift, provenance, cycle comparison, diff-based counts, API pair, blanket waiver | Resolved in v3 (judge 3 confirms); unchanged |
| Failed producers; STOP enforcement; gate wrappers | Bespoke gates deleted (F1/F2). STOPs are explicit per sheet and enforced by the verifier |
| Collisions and prerequisites | Single merge order with listed overlaps (INDEX-v4) |
| Extractor completeness (`?missing` at `edges.v3.tsv:104`) | Resolved by reading the barrel (§1, last row) |
| Permanent CLI / native gates | No CLI. The gate is native repo commands only |

## 4. Owner and coordinator decisions applied

1. F8: the media access-evidence cache stays owned by media. One shared cache is wired through a
   small read/invalidate port in both roots.
2. L15 (9 non-feature boundary errors): in scope.
3. L14: the publish bag goes to server composition.

## 5. Risks still open (honest)

- None of the v4 lanes was dry-run in this revision. Only v3's L01, L02-locale and the (now
  replaced) cache move were. The I and H lanes rely on `typecheck:tests` to surface the last
  fixtures, which is why L05, L08, L10, L14 and L15 are marked for the Opus executor.
- L14's default `object` assumes that object literals against `Partial<object>` raise no
  excess-property errors in bare-typed fixtures. If one does, the sheet's rule applies: give that
  fixture its slice type, never a cast.
- The API-surface worst case is 820 ≤ 821. Gate criterion 2 catches a regression line if a lane
  goes over.
