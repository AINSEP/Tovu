# Cull of r62t-resheet3 (stopped-sheet re-sheets, M5 receiver, AG0-J, D02): over-engineering judge

Input: `cull-inputs-3/r62t-resheet3.md`. Bases checked read-only: Jini `jy-core` 949c622a1, `jy-pb` 42031785d, `jb1` 6da21feaf, `jz2-b` 6a156a70e, merge-6 d3e78b387. Tovu merge-6 776ce6d0f0, `tv-b2` 7e5c158ca6, `tv-tq` f54179c73f, `tv-split` 9bed9c51cf. Anchors opened with `git show`; symbols checked with one `git grep -F`.

Counts (15 rows): **KEEP 7** (J02, J-06, AG0-J, AP-T-SPLIT, C08, D02-SPLIT, D02) / **CUT-TO 5** (J04, AP-T, C08-SPLIT, B02, M5-T) / **DROP 2** (M5-J, M5 Web Vitals SDK) / **HELD 1** (ACP-8). Also agreed: RETIRE J03, J05 and J06 (done on `jz2-b` 6a156a70e). The OWNED-ELSEWHERE and PARKED rows stand as written.

## Verdicts

| Sheet | Verdict | Base | Reason |
|---|---|---|---|
| J02 | KEEP | `jy-core` | Importers verified: production `collect-page-evidence.ts:48`, `playwright-browser.ts:25`, `public-page.ts:6`, `render-page.ts:2`; tests `page-work-budget.test.ts:7`, `render-page.test.ts:9`. The catch is at `:82`, inside `release` at `:79`. The witness case is at `:74–91`. `@jini-ai/core` is already a dependency (`diagnostics/package.json:129`). |
| J04 | CUT-TO | `jy-core` | Keep the two in-place swaps (`config.ts:278`, `:305`). **Keep `mcp/src/index.ts:15` unchanged**; see NEEDS-DECISION 1. |
| J-06 | KEEP | `jy-pb` | `defaultReadFile` has one executable reference (`prompt.ts:105`). The `.` entry is `node` (`cli/package.json:15`), so a static `node:fs` import is safe. The TSV row `daemon/docs/call-shape-sweep.tsv:16753` is a captured comment, so it is left unchanged and allowed explicitly. |
| AG0-J | KEEP | `jb1` | The cases are still absent on `jb1`, `jz-jini`, `jz2-b`, `jy-core` and `jy-pb`. `RunAgentPayload` (`entry.ts:40–43`) has an index signature, so `content: null, isError: 1` needs no cast. Joins the Jini job. |
| M5-J | **DROP** | — | One caller (Tovu M5-T). No second Jini consumer exists, so under "Jini half only if a second caller exists" the collector source stays in Tovu. |
| M5 Web Vitals SDK | DROP | — | Not requested. The owner approved a native receiver only. |
| ACP-8 | HELD | — | Switch it on only after cloud parity. No sheet. |
| AP-T-SPLIT | KEEP | merge-6 | Verified: `createVanillaToolConfirmation` spans `:17–83` (67 lines) and the callback spans `:19–82` (64). Moving `:46–64` and the cleanup body `:66–77` leaves about 42 and 36 lines. The new helper takes `(required, _options = {})`. |
| AP-T | CUT-TO | merge-6 after split | Bug fix kept. Cut the per-send attempt objects and the teardown invalidation; a prompt identity check covers both. Name the `labelText` field (a correctness requirement, see cut text). |
| C08-SPLIT | CUT-TO | merge-6 | `composeIdentitySettings` spans `:51–123` (73 lines). Keep the split. Cut the repoint of test 1 (`:8,18–23`, already red on merge-6, see BUGS 2); only `:27`'s expected list changes. Add the second-declaration note so the STOP rule does not fire again. |
| C08 | KEEP | merge-6 after split | `site-title-settings.ts:44` and the moved `:121` catch were verified. Both witness tests exist. |
| B02 | CUT-TO | merge-6 **or** `tv-b2` | All five B02 files are byte-identical on merge-6 and `tv-b2` (`git diff` is empty). Row 1 is cut to a smaller capture: keep the name `sources`, drop the `.call(optional, …)` receiver ceremony, which is unobservable because `BundledToolKeywordSources` (`:11`) is a plain function type with no `this`. Rows 2–5 are kept. |
| D02-SPLIT | KEEP | `tv-tq` after `tv-split` | Sampler files are identical on both branches. `createDesktopResources` spans `:171–231` (61 lines). The moved `:172–188` leaves about 45. The helper takes `(required, _options = {})`. Importers verified (7). |
| D02 | KEEP | after D02-SPLIT | `readDesktopMemory` try at `:36–45`, `sample` try at `:199–203`, `orFallback` already imported at `:3`. No `tv-y*` or `tv-z*` edits to either file. |
| M5-T | CUT-TO | merge-6 | Site surface only. Collector source moves in from M5-J. Admin half dropped (NEEDS-DECISION 2). |

## Exact cut text

### J04 (Jini, `jy-core`)
Replace the sheet's **Tests first**, **Edit**, **Accounting** and **BREAKS** with the following:
1. Edits: `config.ts:278` becomes `const task = afterSettled({ promise: prev }).then(() => doWrite(dataDir, body, files));`. `:302–308` becomes `return orFallbackSync({ work: () => realpathSync.native(p), fallback: undefined, step: 'Resolve MCP config path' }) ?? path.resolve(p);`. Add `import { afterSettled, orFallbackSync } from '@jini-ai/core/errors/idioms';`.
2. **Do not edit `src/index.ts`, `__tests__/index.test.ts`, the API baseline, API.md, README.md or api.spec.md.** `index.ts:15` is a listed production importer and keeps its line. Every other listed importer keeps its line too (`args-convention.unit.test.ts:2`, `core/__tests__/config.test.ts:12`, `config.write.unit.test.ts:3`, `secret-defaults.test.ts:39`).
3. Witnesses: the existing `config.test.ts:160–203` writer cases. The mutation restores `prev.catch(() => {})` / the try. No BREAKS.

### AP-T (Tovu)
- **React.** Add `const [sendFailed, setSendFailed] = useState(false)` and `const inFlight = useRef(false)`. `receive` also calls `setSendFailed(false)`. `decide`: if `!prompt || inFlight.current` return; set `inFlight.current = true`; `const ok = await confirm(...)`; set `inFlight.current = false`; `if (current.current !== prompt) return;` then `ok ? receive({ directive: null }) : setSendFailed(true)`. No attempt objects and no teardown invalidation (React ignores state updates after unmount, and the identity check already covers expiry and replacement). Return `{ pending, sendFailed, cancelRef, receive, decide }`.
- **Vanilla.** As in the sheet, plus: add ``const labelText = () => sendFailed ? `${directive.title} ${directive.summary} ${sendFailureText}` : `${directive.title} ${directive.summary}`;``. `render` sets `label.textContent = labelText()`. In `bindVanillaToolConfirmation`, replace the required field `directive` with `labelText`, so the observer compares with `labelText()`. Otherwise a failure notice makes the observer and `render` re-fire on every mutation they cause.
- Tests, transport, i18n, Chrome and STOP are as in the sheet.

### C08-SPLIT (Tovu)
- Tests: in `identity-settings.characterization.unit.test.ts`, change only the `:27` expected array, so that its last two entries become the single entry `"{ siteSettingsReady, siteTitleReady }"`, and add one assertion that `startPersistentSiteSettings` declares `siteSettingsReady` before `siteTitleReady`. Leave `:8` and `:18–23` unchanged (BUGS 2).
- Signature: `function startPersistentSiteSettings(required: { analyticsSettingsReady: Promise<void>; siteTitleSettingsDeps: …; siteTitlePreservationStore: SqliteSiteTitlePreservationStore }, _options = {})`.
- STOP-rule note: a **different** `composeIdentitySettings` lives in `memory-deps/slices/identity-settings.ts`. Its importers `app.ts:15`, `memory-deps/route-deps/context.ts:6`, `memory-deps/slices/comments.ts:11` and `memory-deps/slices/site-title-settings.ts:10` are not importers of this sheet's file. Do not STOP on them.

### B02 row 1 (Tovu)
`tool-search-keywords.ts:27–31` becomes: `const listSources = optional.sources;` / `if (!listSources) return keywords;` / `const sources = orFallbackSync({ work: () => listSources({ ...required, filename: 'plugin.json' }), fallback: [], step: 'List tool keyword manifests' });`. The `for (const source of sources)` loop stays as written. Wrap only the per-source body (`:33–35`) in `orFallbackSync` with `undefined` and `'Read tool keyword manifest'`, and keep the comment. Delete the STOP clause "receiver of `sources` changes".

### M5-T (Tovu, site only)
1. **Receiver.** In `R/browser-analytics-http.ts`, inside the existing handler and only for exact `POST /site/diagnostics`, skip the contribution lookup. Use the existing `collectionAllowed` + `limiter`, then call the existing `deliver` with `http: { path: '/_jini/browser-analytics/site', handle: input => receiveBrowserDiagnostics(input, { deps }) }`. Any other method on that path gets 404. No `/admin/diagnostics`.
2. **`R/browser-diagnostics.ts`** exports exactly `browserDiagnosticsEnabled`, `receiveBrowserDiagnostics`, `siteBrowserDiagnosticsBridge` and `siteBrowserDiagnosticsModule`. The collector source (the M5-J text) is a **non-exported** `const` here. No `readBrowserDiagnostics` and no `adminBrowserDiagnosticsContribution`.
   - Enabled means: `deps.observability.supportsMetric === true` and the `TELEMETRY_CONSENT` setting is explicitly `true`. That setting is `core.privacy.telemetry.metrics`, default off (`telemetry-consent.ts:5–9`). A failed read denies.
   - The receiver rules are unchanged: 404/415/413(256 B)/400/204, exactly one key, and the fixed labels.
   - **Never** add diagnostics to `deps.browserAnalytics`: any contribution there suppresses first-party pageviews (`analytics-ingest.ts:89`).
3. **Public pages.** As in the sheet (`site-cookie-consent.ts` `documentPlugins` `:447–450`, module route in `applySiteCookieConsent` `:423–445`, bridge mounting via Jini `bridges.ts:22–35`).
4. **Drop** the `R/browser-analytics.ts` edit, the `currentCredential` import, the admin tests and the admin Chrome look.
5. Tests: the sheet's `browser-analytics-http.unit.test.ts` and `declared-consent.unit.test.ts` cases, site only. Add one collector test in `R/__tests__/browser-diagnostics.unit.test.ts` (it was M5-J's): one buffered navigation, codes 1 and 2, disposal. Mutations: bypass enablement, accept an extra key, emit navigation twice.

## BUGS (confirmed)
1. **Visitor approval silent failure** (merge-6): `apps/site-chat/src/SiteToolConfirmation.hooks.ts:26–27` and `apps/site-chat/src/vanilla-tool-confirmation.ts:43–44` clear the prompt, then `void confirm(…)` discards the boolean from `tool-confirmation.ts:25–31`. A failed send shows nothing. Fixed by AP-T.
2. **Stale, already-red characterization test** (merge-6): `site-deps/__tests__/identity-settings.characterization.unit.test.ts:8,18–23` looks for the `composeIdentitySettings` call in `composition/deps.ts`. The call now lives at `site-deps/boot-phases.ts:91`. This is not a product bug and is outside C08-SPLIT. Recommend a one-line repoint in its own later sheet.

## NEEDS-DECISION
1. **J04: is `@jini-ai/mcp`'s root `index.ts` a "re-export shell"?** **Recommendation: no, keep `writeMcpConfig` exported.**
   - It is the package's only public entry (`exports["."]`), with explicit named exports. It is not a forwarding module left behind by a move.
   - "Breaks accepted" (owner decision 7) covers Tovu-name removal.
   - Removing the root export strands the writer: mcp has no config subpath, so this is a deletion, not a repoint.
   - The STOP was a false positive. An in-place catch swap repoints nothing.

   If the owner says remove it anyway, restore the re-sheet's J04 edits and add this to the sheet:
   - `BREAKS: @jini-ai/mcp root no longer exports writeMcpConfig; no public replacement path.`
   - `.changeset/mcp-remove-root-writemcpconfig.md` (`"@jini-ai/mcp": major`, one line: "Remove `writeMcpConfig` from the package root; it has no public replacement.").
2. **M5 admin surface: collect admin-page diagnostics too?** **Recommendation: not now.** The site receiver satisfies the approval. The admin half adds a second consent path (session + operator setting), an HTML-capture edit and a second Chrome look, all for one surface that already has its own telemetry path.
