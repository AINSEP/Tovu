# Move-to-Jini pilot: 5 features for Sonnet 5.5 HIGH (plan, 2026-11-15)

Clones: Tovu `/Users/la/Programming/tovu-codex-trial-terra`, Jini `/Users/la/Programming/jini-terra-base` (both `refactor/terra`, Tovu HEAD `adcce23ff`, Jini HEAD `d4bfc6ceb`). Each recipe is self-contained (common rules appended). Nothing here was executed.

## The five
| id | kind | Tovu source | Jini target | why picked |
|---|---|---|---|---|
| E01 | MOVE | `website/features/email-templates/render.ts` (+ test) | `@jini-ai/platform/mail/email-template` (new subpath) | Pure, no ports; email templates are directly reusable in Open Marketing. Teaches new-subpath plumbing (exports, `jini.entries`, optional-peer text, README) and keeping `parse5` out of the `./mail` barrel. |
| E02 | MIXED + port | `website/server/runtime/composition/provider-revision-watch.ts` | `@jini-ai/plugins/host` `watchProviderRevisions` | Real split: generic polling loop moves, Tovu keeps the `secrets_vault` SQL and injects its key format as `pluginIdOf`; positional `schedule` port becomes object-shaped; tests split by what they exercise. |
| E03 | DEDUPE | `site-chat/src/remixicon-override.ts` | existing `@jini-ai/ui` `installRemixIconStylesheet` | Jini already has the superset; Tovu keeps only its href + why. Has a small behaviour change, so it exercises the failing-test-first rule. |
| E04 | admin UI | `admin/components/CodeView/{CodeView.tsx,use-code-wrap.hooks.ts}` | `@jini-ai/ui` viewer-shell: `CodeWithLines` `wrap` prop, `CodeWrapToggle`, `useCodeWrap` | React piece with the jini- CSS prefix rule: Tovu renames selectors in CSS, 2 unit tests and 1 e2e pin. Needs a Chrome look after. |
| E05 | server | `website/server/inbound/shared/trust-proxy.ts` | `@jini-ai/http-kit` `resolveTrustProxySetting` | Express stays in Tovu (no server framework in Jini); env name, product wording and host signals bound by Tovu; lazy platform-hops port keeps behaviour. Useful to any hosted Open Marketing server. |

Rejected on the way (reason): `contracts/core/entry-refs` DEDUPE (touches 4 arg-rule files: html-document-store(.memory).ts, widgets/deps.ts, publish-content/type-registry.ts); `features/image-transform/image-ops.ts` (needs a new `@cfworker/json-schema` dep in cms = lockfile); `server/http/request-cookie.ts` (new `cookie` dep + 9 importers); `public-http/middleware/canonical-site-host.ts` (`node:net` into universal `cms/seo`); `object-storage/media-store.ts` (D2: core runtime); `site-export/ports.ts` (Jini types are wider, needs generics); `security/SiteKeyTab.hooks.tsx` (Jini clipboard fallback would put the site key in a DOM textarea: secrecy risk); `users-port.hooks.ts` (call shapes differ); `runtime/services/external-mcp-*` (hosted MCP: owner approval). None of the five is D2, none sits in the 24-feature SCC or needs one of the 5 cuts.

## Order
E05, E02, E01, E03, E04 (smallest blast radius first; E04 last because it is UI and needs a look). Within each: Jini commit, then Tovu commit. Features are independent: a SKIP never blocks another.

## Files each recipe touches
- E01 Jini: `packages/platform/src/mail/email-template.ts` (new), `packages/platform/src/mail/__tests__/email-template.test.ts` (new), `packages/platform/package.json`, `packages/platform/README.md`, `.changeset/platform-mail-email-template.md` (new). Tovu: `apps/website/src/features/email-templates/{index.ts,operations.ts}`, deletes `.../render.ts`, `.../__tests__/render.test.ts`.
- E02 Jini: `packages/plugins/src/host/provider-revision-watch.ts` (new), `packages/plugins/src/host/index.ts`, `packages/plugins/src/host/__tests__/unit/provider-revision-watch.unit.test.ts` (new), `.changeset/plugins-provider-revision-watch.md` (new). Tovu: `apps/website/src/server/runtime/composition/{provider-revision-watch.ts,deps.ts,__tests__/provider-revision-watch.unit.test.ts}`.
- E03 Jini: `packages/ui/src/react/__tests__/components/RemixIcon.stylesheet.test.tsx`. Tovu: `apps/site-chat/src/remixicon-override.ts`, `apps/site-chat/src/__tests__/remixicon-override.test.ts`.
- E04 Jini: `packages/ui/src/features/viewer-shell/{react/components/CodeWithLines.tsx,react/components/CodeWrapToggle.tsx (new),react/hooks/useCodeWrap.ts (new),index.ts,__tests__/index.test.ts,__tests__/react/components/CodeWithLines.test.tsx}`, `.changeset/ui-code-wrap.md` (new). Tovu: `apps/admin/src/features/themes/ThemeExplore.tsx`, `apps/admin/src/components/TemplateSource/TemplateSourceModal.tsx`, `apps/admin/src/features/plugins/PackageFilesModal.tsx`, `apps/admin/src/styles.css`, `apps/admin/src/features/plugins/__tests__/AgentPluginDetailsModal.unit.test.tsx`, `apps/admin/src/features/themes/__tests__/ThemeExplore.unit.test.tsx`, `development/e2e/journeys/admin-layout.pins.journey.ts`, deletes `apps/admin/src/components/CodeView/{CodeView.tsx,use-code-wrap.hooks.ts}`.
- E05 Jini: `packages/http-kit/src/trust-proxy.ts` (new), `packages/http-kit/src/index.ts`, `packages/http-kit/src/__tests__/trust-proxy.test.ts` (new), `.changeset/http-kit-trust-proxy.md` (new). Tovu: `apps/website/src/server/inbound/shared/trust-proxy.ts`.

## Overlap check
- `sonnet-batch1-args/INDEX.md` and `sonnet-batch1-errors/INDEX.md`: NOT written when this plan was finalized. Fallback used: the violation file lists of `codex-trial/wave7/T-a26.md` … `T-a46.md` (688 files). No pilot file is in that list. Deliberate dodges: E05 keeps the Tovu API so `server/runtime/composition/app.ts` (in the list) is not edited; entry-refs was dropped for its 4 listed importers.
- `sonnet-batch2/INDEX.md` (appeared during planning): grep for every pilot path found no match.
- Residual risk: the arg jobs also edit EVERY caller repo-wide, so a pilot file can still be touched if it calls a converted function. Highest risk: `composition/deps.ts` (E02, 3 import lines + 1 call) and `styles.css`/`ThemeExplore.tsx` (E04). Recipes guard these by exact old text, not blob, so a conflict becomes a clean SKIP. Re-run the overlap grep against the two batch1 INDEX files before dispatch.
- Not checked: the error-logging and Batch 2 designs in `tovu-terra-w3-db` / `tovu-terra-d1/development/refactor-patterns` beyond the batch2 INDEX.

## Risks
1. D1: Tovu's node_modules hold npm 0.7.x, so new Jini specifiers (E01 subpath, E02/E03/E04/E05 new names) do not resolve in Tovu until the Jini clone is linked. Tovu eslint may report unresolved imports (expected, recorded); Tovu typecheck/tests only make sense in a linked cloud run.
2. Behaviour: E03 changes behaviour (return value + Jini font recovery in browsers) — failing test written first but not run here; the cloud batch must show RED on the parent and GREEN after. E03 also pulls the `@jini-ai/ui` root into the public iife bundle: compare `dist/site-assistant.js` size. E04 is a DOM/class rename: needs a Claude-in-Chrome look of the 3 viewers.
3. Jini gates not run here: `check-subpath-isolation` (E01 new entry; E02 `./host` purity test forbids `node:` imports — the new file has none), `check-hardwiring`/neutrality, complexity/size. They belong in the batched cloud check.
4. Changesets: Jini uses a fixed group (`@jini-ai/*`), so four `minor` changesets bump everything to 0.8.0 at the one publish (D1). Fine, but say so to the owner.
5. E01 moves 323 lines verbatim; complexity/size of its functions was within Tovu's 10/10 gate, Jini's gate is the same, unverified.

## What the pilot should teach before the other 165
- Recipe format: are verbatim-copy-plus-listed-edits (E01) and full-content files (E02, E04, E05) both followed exactly? Did STOP fire on anything real (false SKIPs = guards too tight)?
- Sonnet capacity: E01/E03/E05 are small (1-2 Tovu files); E02 is medium (3 Tovu files, a test split); E04 is the widest (9 Tovu files, a counted rename). If E04 lands clean, a Sonnet job can take ~10 Tovu files; if not, cap at ~4.
- Cost: planning these 5 took one Opus context (~270k tokens, ~55k of it reading per feature). Expect Sonnet ~40-80k tokens per recipe (reads + edits + eslint). Measure actual tokens per recipe from the reports and divide the Opus planning cost by 5 for the per-feature planning figure; at ~55k Opus + ~60k Sonnet per feature, 165 features is ~9M Opus + ~10M Sonnet tokens, so planning several features per Opus pass (batching by package) is the main lever.
- Process gaps to decide: who runs the Jini gates and the RED/GREEN check (batched cloud run per the single-runner rule), and when the 4 minor changesets are acceptable.
