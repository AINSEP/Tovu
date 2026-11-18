# sheet-fixes-2 — report (2026-11-18, Opus, unattended plan-edit run; no product code changed)
Facts re-derived on `origin/refactor/terra` = Tovu ada11733f / Jini 4c1892368 (desktop D0c also on `wave3/desktop-d0c` Tovu faa0b6b7, which adds `wave2/desktop-d0`). No subagents; no source edited in either repo.

## Verdicts
| Sheet | Verdict | What changed | What a rerun needs |
|---|---|---|---|
| K-03 comments tools | EXECUTABLE | New BINDINGS class `own-limit` + step S0b (K-TOOLS-PATTERN rev 4): `MAX_DEPTH_CEILING`, `MAX_PER_IP_PER_HOUR_CEILING` move to Jini leaf `cms/src/comments/settings-limits.ts`; Tovu `settings.ts` (the validator) imports them from `@jini-ai/cms/comments`; the characterization test repoints (rule 7a). One source, catalog shape unchanged (precedent: `cms/seo` `STRING_FIELD_MAX_LENGTH`, `cms/forms` `MAX_FIELDS`). `also-writes:` line, S0b census in a code block, V3 mutation named | Fresh branch from refactor/terra; run S0, S0b, S1-S4. Blobs unchanged (c357a590, d6162056) |
| K-04 SEO tools | EXECUTABLE | Same, six bounds -> `cms/src/seo/settings-limits.ts`; V3 = `MAX_ROBOTS_RULES = 49` -> `seo/__tests__/settings.test.ts:126` RED | Same as K-03; independent of K-03 except the shared `size-debt.json` (chain K stays serial) |
| K-05 taxonomy tools | VOID (done) | Same gap existed (`taxonomyAgentToolCatalog` from Tovu `./agent-tools.js`); run `wave3/kt-k05` already finished it with a REQUIRED `catalog` builder field. Recorded the row + that run's red-then-fixed commit (274f8a20 -> a964de0f) | None. Merge gate should check the branch tip, not each commit |
| K-07 trash tools | EXECUTABLE (unchanged) | Checked: no unbound STAY import (catalog's STAY imports leave via Tovu `tool-kinds.ts`) | Cross-plan rule with lane S S4a/S4b still applies |
| K-09 webhook tools | EXECUTABLE | No gap; sidecars REGENERATED (blob drift: `tool-registrations.ts` d2b4a82c -> 2775d5e8, commit 21ce3a24 added `egressTargetCheck`, no new import) | Run `wave3/kt-k09-k10` was at K-09 S2 (c688f856): if it stopped, rerun from its last pushed step with these sidecars; if it finished, VOID |
| K-10a forms seam | EXECUTABLE (unchanged; note added) | Tovu-only seam does not hit the gap | If the running `wave3/kt-k09-k10` stopped in K-10a for another reason, rerun from its last pushed step |
| K-10b forms move | EXECUTABLE | Same gap: catalog imports AND re-exports `DELIVERY_STATUS_MAX_LIMIT` from `#src/contracts/headless/index`; `forms/index.ts:204` re-exports it again. New step S2b: constant -> `cms/src/forms/delivery-status-limits.ts`; both forwarders deleted; `form-delivery-repo.ts` repointed | If that run reached K-10b on the old sheet and stopped, rerun from S2b on its branch |
| D0c design (desktop) | DONE (judged) | `desktop-extraction/designs/D0c.md` = the run's draft + JUDGMENT: inventory drift confirmed (9 modules); `process-error-guards` + `jini-routes` stay Tovu (product wording / Express glue); daemon-connection split moves zod SCHEMAS (draft wrongly said functions); product telemetry + host signals under-scoped | - |
| D0c1 | EXECUTABLE | Scaffold `@tovu/host-shared` (npm workspace, both lockfiles, `build-server.mjs`) + `process-error-guards` + `product-events` + `jini-routes`; censuses in code blocks; allowed mock-specifier test edit; error-gate debt follows the file | Base `wave3/desktop-d0c` (or terra once it holds `wave2/desktop-d0` 830a98511). P owed (DX-OD10) |
| D0c2 | EXECUTABLE after D0c1 | `startup-secrets` (19 importers) + daemon-connection schema split, behaviour pins + V3 | Same; P owed |
| D0c3 | BLOCKED (Opus design) | Provider loading drags `plugin-runtime/host-binding.ts`; host signals drag 2 files with 40 importers; `bundledAgentPluginsDir` needs a lazy root thunk; staging-step deletion + verifier change stay here | A design answering the 4 questions in the sheet |
| audit2 A60 | S1+S3 DONE; S2 EXECUTABLE | Desktop step rewritten: `npm install --prefix apps/desktop --save @jini-ai/agent-plugins@^0.7.0` (own npm project, not the pnpm trap), relink, lockfile in the same commit; `jini-mcp-peers.test.ts` RED->GREEN proof | Base `wave3/audit2-a` (Jini fa1d2026); P owed |
| audit2 A58 | EXECUTABLE (rewritten) | Binds to the landed `desktop-host/electron` `registerAppVersionBridge` (`versionFromTag`, `devSuffix`); Jini adds only `createAppVersionLoader`/`createUpdateCheck` on a new universal `./app-version` entry; Tovu keeps `registerAppVersionIpc`'s signature | refactor/terra; P owed |
| audit2 A10 | VOID (V1-V3 done) / BLOCKED (V4-V8) | Core `formatByteSize` has a fixed display rule; the five remaining formatters print different labels | Owner question A10-Q1 (recommendation in the sheet) |
| audit2 A01 | VOID (done items) / BLOCKED (per item) | Per-item table: 4 done, 3 not forwarders, 5 need owner parity decisions or a prerequisite | Owner picks items (A01-Q1: adopt Jini copy semantics) |
| audit2 A11 | BLOCKED | Collides with desktop-extraction D1b1/D3 (files classified STAY / IPC run); needs Opus design + packaged proof | Coordinator retires it or folds it into D1/D3 |
| audit2 A14 | BLOCKED | Release-gate "same output" proof needs a packaged build + CI; `stage-website-shared.ts` leaves scope (D0c3 deletes it) | A CI job recording base gate outputs |

## Pushed (plan branches only, fast-forward)
- `plan/lanes-k-t-2026-11-16`: f56989bc (K fixes + K-09 sidecars) and this report's commit.
- `plan/desktop-extraction-2026-11-16`: a7e978a4.
- `plan/audit2-sheets-a2`: 8cfbe9a7 (A10). `plan/audit2-sheets-a3`: 46994c3f (A58, A60, A01/A11/A14). `plan/audit2-2026-11-15`: a2362712 (status note).

## Not done / noticed
- Lane T drift on refactor/terra, not regenerated here (design-queue sheets): `T-PO-05` (`post/tool-registrations.ts`), `T-TH-08` (`theme/tool-registrations.ts`).
- K-TOOLS-PATTERN and COMMON-KT still name the 2026-11-17 base pins (232764af5 / 65d73b0d5); ada11733f / 4c1892368 descend from them and every K blob except K-09 still matches.
- The desktop-extraction COMMON section 1 (merge-a/merge-b BASE) is historical; D0c now names its own base.
