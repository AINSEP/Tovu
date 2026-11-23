PARTIAL: Settings 3 (K5 binding of the moved settings services) and Settings 4 (K3 site-title seam) not started — stopped near the 150-tool-call cap

# rv-d FIX run — Add-ons, Integrations, Settings, Security

Source: Tovu `origin/plan/whats-left-1122:reviews/rv-d-addons-integrations-settings-security.md`.
11 of 13 FIX items fixed; each fixed item was committed and pushed on its own branch before the next.

## Branch heads after this run

| branch | head |
|---|---|
| Jini `codex/ex4-addons-jini` | `28289de4` |
| Jini `codex/ex4-integrations-jini` | `c5dafebd` |
| Jini `codex/ex4-settings-jini` | `1b784214` |
| Jini `codex/ex4-security-jini` | `14383c34` |
| Tovu `codex/ex4-addons-tovu` | `2287da629` + this report |
| Tovu `codex/ex4-integrations-tovu` | `7b86bb9b1` |
| Tovu `codex/ex4-settings-tovu` | `3ddc4fbfc` |
| Tovu `codex/ex4-security-tovu` | `cd973b87b` (unchanged: Security had no Tovu source in this batch) |

## Per item

| item | status | commits | tests (first, red then green) | named mutation (red, then restored) |
|---|---|---|---|---|
| Add-ons 1: remove the descriptor parser forwarding module | **fixed** | Jini `28289de4`; Tovu `2287da629` | The retained Tovu parser test, now importing `@jini-ai/core/text`: 14/14 | M-A1: Core `MAX_LOCALES = 0` → 8/14 red |
| Integrations 1: defer the unused project-scope export | **fixed** | Jini `4ef754c5` | Removal only. The abort-guarded test stays. No Tovu importer of the Jini copy existed. | n/a (removal) |
| Integrations 2: inject the versioned-write collaborator | **fixed** | Jini `c5dafebd`; Tovu `b36cd1eb7` | New dialect case: the save finishes through the injected collaborator (red before the change). Jini dialect suite 14/14. Tovu webhook binding suites 102/103 (the one failure is base-red, see below). | M-I2a: drop the `version` predicate → 4/14 red. M-I2b: skip the collaborator call → 6/14 red. M-I2T (Tovu): bind a no-op collaborator → 4/27 lost-update cases red |
| Integrations 3: record the MCP roster env rename | **fixed, needs a fold-in** | Tovu `7b86bb9b1` | n/a (ledger) | n/a |
| Settings 1: no raw exception text in the timezone fallback log | **fixed** | Jini `061520ff` (+ `d7023988`: baseline correction); Tovu `3ddc4fbfc` | Jini: an error that echoes a connection-string secret stays out of the report (5/5). Tovu: a new reporter test, and the console-capture case now asserts the message is absent (11/11). | M-S1: carry `String(err)` in the report → 1/5 red. M-S1T: attach an error object to the log → red |
| Settings 2: split the SEO dictionary | **fixed** | Jini `1b784214` | Existing parity test 23/23. `check:size` lists no `seo-i18n` row. | M-S2: drop one locale module → 4/23 red |
| Settings 3: finish the K5 binding | **not started** | — | — | — |
| Settings 4: K3 seam for the held site title | **not started** | — | — | — |
| Security 1: password-login admission order and parser totality | **fixed** | Jini `4660d1df` | 3 new cases: parser totality on `{"toString":1}`; a denied 429 with coercion-failing fields gets the exact body and `Retry-After`; an allowed coercion failure happens after the limiter without signing in. Auth suites 44/44. | M-SEC1: coerce before the limiter → 2/24 red |
| Security 2: MFA refusal body only explicitly public text | **fixed** | Jini `a580ea79` | Canonical refusal keeps the exact 400 `MFA_REFUSED` bytes. A collaborator `IdentityValidationError` that echoes the proof is rethrown to the host with no-store already set. 45/45. `check:log-safety` no longer lists `mfa-login.ts`. | M-SEC2: put any validation error's message in the body → 3/25 red |
| Security 3: untrusted root-key detail out of snapshots and notices | **fixed** | Jini `60bccdaa` | A secret echoed in `detail` is absent from the snapshot (known and unknown code) and from the DOM (host-copy path and fallback path). 288/288. | M-SEC3: carry `detail` through classification → 3/288 red |
| Security 4: recovery affordances only with working controller behavior | **fixed** | Jini `14383c34` | A locked generate refusal after a clean status leaves `locked` false and shows no recovery note. 289/289. | M-SEC4: restore the refusal-driven `locked` flag → 1/289 red |

### What each fix does

- **Add-ons 1.** The Jini `./site/descriptor-i18n` subpath is gone: source, `exports`, runtime map, API baseline entry and changeset mention.
  - Tovu `source-control/provider-registry.ts` and `descriptor-i18n.unit.test.ts` import `parseDescriptorI18n` from `@jini-ai/core/text`.
  - The descriptor-localization rationale (host deploy-target and source-control registries; no forwarding wrapper) now sits beside the canonical parser in Core `text/descriptor-i18n.ts`.
  - The why-comment debt reason and the stale comment in admin `lib/descriptor-i18n.ts` now point to `@jini-ai/core/text`.
- **Integrations 1.** The Jini `vendor-credentials/project-scope.ts` and its test are removed, along with its exports, runtime map, `typesVersions`, API baseline and changeset mention.
  - When it lands with the Tovu deletion and consumer repoints, its public signatures should use required and optional objects (review note, not done here).
- **Integrations 2.** `SqlWebhookSubscriptionRepo` takes `WebhookSubscriptionSqlRequired`, which is `WebhookSqlRequired` plus a feature-owned `AssertVersionedWritePort`.
  - I extended the existing object instead of adding the field to `WebhookSqlRequired` itself, so the delivery repo does not receive a required collaborator it never uses (narrow required props rule).
  - The Tovu SQLite binding and `platform/db/__tests__/webhook-adapters.ts` pass Core's `assertVersionedWrite`.
  - The webhooks README has a new `## Wiring` section.
- **Integrations 3.** `plans/P9-BREAKS.md` exists only on `plan/whats-left-1122`, and this run is barred from pushing `plan/*`.
  - The filled `X-external-mcp-1` row is in Tovu `plans/P9-BREAKS.rows/X-external-mcp-1.md` on `codex/ex4-integrations-tovu`.
  - It covers the new name, the desktop writer, the empty managed roster for manually launched sites, the `builtIn: false` listing and the lost permanent-delete protection.
  - **Owner action:** paste that row over the empty `X-external-mcp-1` row in `plans/P9-BREAKS.md` before combining the pair.
- **Settings 1.** `ResolveSiteTimeZoneDeps.reportFallback` is a required, narrow prop.
  - Jini reports the fixed `SITE_TIME_ZONE_FALLBACK_MESSAGE` with `{ workspaceId, errorClass }` and no longer uses the console logger.
  - Tovu `features/settings/site-timezone-fallback.ts` logs that text and those fields. It is bound at `app.ts`, `site-deps/identity-settings.ts` and `site-deps/site-sharing.ts`.
- **Settings 2.** `seo-i18n.ts` (26 lines) merges `seo-i18n.locales-{a,b,c,d}.ts` (435, 457, 425 and 285 lines) and `seo-i18n.sitemap-link.ts`.
  - All 21 locales keep their original order, and the locale keys are disjoint.
  - The common-dictionary fallback is unchanged.
- **Security 1.** `parse` now carries `{ body }` through, so it is total. The handler coerces the fields after `identityReady` and the limiter, inside its existing error boundary.
  - `PasswordLoginInput` is now `{ body }` (API baseline updated).
- **Security 2.**
  - New `MfaProofRefusedError extends IdentityValidationError` with a fixed `MFA_PROOF_REFUSED_MESSAGE`. The MFA service's `refused()` throws it.
  - `mfaLoginRoute` answers only that class. Everything else goes to the host's redacted envelope.
  - B12 is restated in the user-management README `## Wiring` section. **Before mounting:** the host's `completeOwnerLogin` binding must throw `MfaProofRefusedError` for a bad proof. Otherwise a bad code becomes a host error instead of a 400.
- **Security 3.** `classifyRootKeyRefusal` now returns `{ kind, code }` for known codes and `{ kind: 'generic' }` otherwise, and never returns `detail`.
  - There is a new optional chrome option, `describeRootKeyRefusal({ code })`, for host-approved copy. Without it the tab shows the fixed fallback "The root key could not be created."
  - **Host follow-up:** to keep Tovu's per-code sentences, bind `describeRootKeyRefusal` at the cutover.
- **Security 4.** The view's `locked` flag and recovery note depend on status only, matching the controller.
  - The no-op `rootKeyTab.previewRequired` option is removed and deferred to SEC-7, together with the shared effective-locked predicate.

## Not done (PARTIAL)

- **Settings 3 (K5).** Not started. `admin-interface`, `chart-provider`, `form-delivery`, `form-destination`, `mail-sender`, `site-timezone` and `search/site/settings` still import Core's `ensureSettingDefinitions` and `getEffective` directly.
  - The fix is to thread registration and read operations through their dependency objects and bind them at the Tovu composition sites.
  - Settings 1 already gave `site-timezone` a deps object to extend.
- **Settings 4 (K3 site title).** Not started.
  - Tovu `features/settings/site-title.ts:50,152,223` should carry one host-supplied legacy title through registration, legacy preservation and resolution.
  - The stored default, the workspace pin and the render fallback must be preserved.

## Verification

- **Jini.** Frozen `pnpm install` and a full `pnpm -r build` baseline (exit 0). The changed packages and their dependents were rebuilt before each verification.
  - Package `tsc --noEmit` was clean for agent-plugins, core, integrations, cms, admin and user-management.
  - `pnpm guard` exit 0 on every branch. `pnpm api:check` was clean after each `api:update`.
  - **Mistake:** one `api:update` (`061520ff`) picked up stale admin, analytics and search dist from another branch. It was corrected in `d7023988` after rebuilding, and the API baseline diff against the prior head is now only the intended cms entry.
- **Tovu.**
  - **Setup:** root and `apps/admin` `npm ci`; `npm run link:jini` with `JINI_PACKAGES_DIR=/home/user/Jini/packages`, relinked after each Jini branch switch. `packages/sdk` had to be built for website `tsc`.
  - **Typecheck:** website `tsc -p tsconfig.json --noEmit` exit 0 on add-ons, integrations and settings.
  - **Admin typecheck** (`apps/admin tsc --noEmit`) fails with 4 errors that predate this run: kit `Icon`, `useT` and `values` are missing, in `src/integrations/jini-kits.ts` and `src/main.tsx`. This is the base mismatch the review notes ("supplied bases already disagree on `Icon`, `useT`, and kit `values`"). The only admin edit in this run was a comment.
  - **Tests:** Tovu website tests run with node:test (the package's runner) on the changed files.
  - **Base-red:** `webhook-delivery-worker.shutdown.test.ts` "a receiver trickling bytes forever…" also fails on the unmodified integrations branch. It expects the timeout message to end in `/hooks`; the actual message ends at `https://example.com`. This is unrelated to this run.
- Not run: the whole-repo `pnpm typecheck`, and the full Tovu suites.

## FILES MOVED

None. This run added or removed files only to apply the review:
- **Removed (Jini):** `agent-plugins/src/site/descriptor-i18n.ts`; `integrations/src/vendor-credentials/project-scope.ts` and its test.
- **Added (Jini):** `admin/src/screens/seo/seo-i18n.locales-{a,b,c,d}.ts`, `seo-i18n.sitemap-link.ts`.
- **Added (Tovu):** `apps/website/src/features/settings/site-timezone-fallback.ts` and its unit test; `plans/P9-BREAKS.rows/X-external-mcp-1.md`.
