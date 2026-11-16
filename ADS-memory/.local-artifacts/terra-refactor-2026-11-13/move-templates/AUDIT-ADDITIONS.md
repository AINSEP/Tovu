# Codex "missed extraction" audit: Claude judgment (2026-11-15)

Source: `../codex-extract-audit-2026-11-15/out/{1-website-features,2-website-server-platform,3-admin-sitechat,4-desktop-scripts}.md` (Codex, blind and read-only). Each claim was checked against `refactor/terra` source through git objects (Tovu `tovu-codex-trial-terra`, Jini `jini-terra-base`) and against `CLASSIFY.tsv` / `CLASSIFY-files.tsv`. Planning only: no code was touched and `CLASSIFY.tsv` was not edited. The ACCEPT rows are in `AUDIT-ADDITIONS.tsv`, with the same 21 columns as `CLASSIFY.tsv`. Feature keys are prefixed `audit:<id>` so a merge cannot collide with an existing row.

## Summary
- **43 candidates judged: 26 ACCEPT (25 TSV rows, because A02 merges two candidates), 16 ACCEPT-LATER, 1 REJECT.** There is also 1 label correction with no new row: the site-chat micromark blocker.
- **Size of the ACCEPT rows:** about 7.2k movable lines. Every one was confirmed absent from `CLASSIFY-files.tsv`, except `dev-auth.ts` and `pending-agent-plugin-tokens.ts`, which are relabels.
- **Unblocked:** 14 rows can start in W1/W2 (`hard_blocked=no`), 8 are partly blocked and 3 are blocked (publish-trust cycle cuts, external-mcp row 146, and the server-port).
- **Token estimate (PLAN.md rates):** sheets about 0.16M Opus + 0.38M Sonnet, execution about 1.1M Sonnet, across 30 slices: 18 Sonnet, 8 Sonnet+review, 4 Opus.
- **Codex over-rated in two ways:**
  - Several "generic lifecycles" are 30–60 real lines wrapped in product copy (reauth tool, connection source, custom instructions, boot token, vault guards).
  - It treated all dev tooling as Jini material. Only tooling with an existing Jini twin, or tooling every Jini-consuming host needs, is accepted for `@jini-ai/devops`. Generic code-analysis engines go to the AI-Dev-Shop toolkit later.
- **Biggest real finds:**
  - Tovu runs its own 809-line run finalizer beside Jini's `chat/server/run-finalizer`.
  - Jini's `devops/checks/coverage` and `checks/published-types` were extracted from Tovu scripts (W3 L060a), but Tovu was never repointed. About 2k duplicated gate lines are still live.
  - Half of publish-trust (challenge/keys/session/provisioning) is missing from row 131's trust module.

## Top 10 by value (reuse x size x duplicate risk)
| # | id | What | Why it matters |
|---|---|---|---|
| 1 | B01 | Run finalizer HARDEN into `chat/server/run-finalizer` | A live parallel implementation of core chat persistence. Jini's copy lacks recovery and checkpoint growth, so every other host gets the weaker one |
| 2 | A01 | Publish-trust protocol (challenge, keys, session, provisioning) → `cms/publish` | Without it, row 131 moves half a protocol; the challenge, session and key halves must live together |
| 3 | D03 | Coverage gates → existing `devops/checks/coverage` | About 1.4k lines duplicated against a Jini twin that already exists |
| 4 | D08 | Published-types / registry drift → existing `devops/checks/published-types` | 658 duplicated lines on the release gate path |
| 5 | B02 | Form feedback codec → `cms/forms/html` | Jini's form handler forces every host to re-implement this codec |
| 6 | A03 | Visitor confirmation binding → `daemon/surface-exchanges` | Security mechanism (digest binding, claim-before-await) that any public site assistant needs |
| 7 | C01 | Admin database screen → `admin/database(/react)` | The port exists in Jini but the UI does not; about 780 lines |
| 8 | B05 | Daemon transport client → `daemon/http` | Every host that proxies to the daemon needs the retry and ambiguous-write rules |
| 9 | B04 | Admin credential/session middleware → `user-management/server` | Every host needs it. It is blocked on server-port, so it goes in the row-167 wave |
| 10 | A05 | Render-UI tool handler → `agentic/a2ui` | Small, and it gives any A2UI host the "draw a surface" tool |

## ACCEPT (rows in AUDIT-ADDITIONS.tsv)
| id | Tovu path | Kind | Target (pkg/subpath: contract) | Stays in Tovu | Lines | Blockers / depends | Tier |
|---|---|---|---|---|---:|---|---|
| A01 | `features/publish-trust/{challenge,keys,session,provisioning}.ts` | SPLIT | `cms/publish` trust: issue/verifyChallenge, derive keys from core `KeyringPort`, mint/verifySession, grant-document parse/merge, `createFileProvisioning` | `TOVU_PUBLISH_TRUST`, config path, precedence inputs, describe*() copy; `tovu-publish-challenge-v1` and `pub:` passed as values (wire) | ~800/1299 | cycle-cuts; after row 131 | Sonnet+review ×2 |
| A02 | `assistant/external-mcp-reauth-tool.ts`, `external-mcp-connection-source.ts` | SPLIT | `mcp/federation/hosted`: reauth notice handler, stored connection source | Tool id/catalog/permission, `ui://tovu` URI, Settings link + copy, legacy-desktop cleanup, plugin adapters | ~180 | Row 146 (now unblocked by the 11-15 owner decision) | Sonnet+review |
| A03 | `assistant/site/visitor-confirmation{-gate,s}.ts` | SPLIT | `daemon/surface-exchanges`: bound confirmation gate + bound confirmations | Copy table, visitor policy, publication check, caps values, directive mapping | ~150 | none | Sonnet+review (security) |
| A04 | `assistant/byok-credential.ts` | SPLIT | `agent-runtime/providers/credentials` (new) | Stored credential adapter, precedence choice | ~90 | none | Sonnet |
| A05 | `assistant/render-ui-tool.ts` | SPLIT | `agentic/a2ui`: `createRenderUiHandler` (core surface types only) | Tool id, registration, model-facing notes | ~110 | none | Sonnet |
| A06 | `assistant/custom-instructions.ts` | MOVE | `agent-runtime/prompt-augmenter`: refreshable overlay | Namespace/key, header copy | ~120 | none (low value, cheap) | Sonnet |
| A08 | `features/identity/boot-session-token.ts` | SPLIT | `user-management/server`: `createBootSessionTokenStore` | Singleton, launcher handshake, route | ~50 | Fold into the row-56 sheet | Sonnet |
| A09 | `features/site-backup/plan-store.ts` | DEDUPE | `core/gated-mutations`: `SingleUsePlanStore<T>`; Jini db `DatabaseTransferPlanStore` adopts it too | Payload types, TTL/cap values | 55 | D2 (stateful; see question) | Sonnet |
| A10 | `features/agent-plugins/admin-surfaces/issued-sign-ins.ts` | MOVE | `agent-plugins` admin-surfaces node entry: `createIssuedSignInCollector` | Link-admission predicate (required option) | 44 | none (survey said MOVE; tracking gap) | Sonnet |
| B01 | `composition/modules/assistant-run-finalizer.ts` | HARDEN | `chat/server/run-finalizer` gains growth checkpoints, recovery, reconnect | Ledger, daemon creds, process-death check, resume policy, notices | ~500/809 | jini-hardening-first; hot composition file | Opus + Sonnet |
| B02 | `public-http/http/site/form-render.ts` | SPLIT | `cms/forms/html`: `createFormSubmitResultCodec` + HTML feedback/token/max-length helpers | Cookie/query names (wire), baseline CSS/JS, classes, copy | ~475/781 | after row 13 (escape) | Sonnet+review |
| B04 | `admin-http/dev-auth.ts` | SERVER | `user-management/server`: credential precedence, current principal, session middleware on `core/contracts/server` | Cookie names, lifetimes, local-owner, boot redemption, publish-trust bypass, MFA routes, copy | ~200/853 | server-port, S1; inside the row-167 wave | Opus |
| B05 | `composition/modules/assistant-daemon-client.ts` | SPLIT | `daemon/http` client: `createDaemonTransport` | Express mapping, principal header, park recovery, copy | ~140/381 | After lifecycle; inject sidecar `ipcRefusalReason` | Sonnet+review |
| B06 | `composition/pending-agent-plugin-tokens.ts` | SPLIT | `agent-plugins/connect`: pending credential lifecycle | Filename, `tovu:` AAD (wire), `ensureSiteKey`, triggers | ~100/162 | none | Sonnet |
| B07 | `public-http/http/site/external-links.ts` | MOVE | `cms/presentation`: `markOffSiteLinksOpenInNewTab` | On/off policy, site host | 134 | after row 13 | Sonnet |
| C01 | `admin/features/database/{Database.tsx,rules.ts,use-migrate-forward,use-schema-state}` | UI | `admin/database(/react)` on the existing `AdminDatabasePort` (+ schema-state read, token-name adapter) | i18n (1,231 lines), navigation, event kinds, HTTP adapter | ~780 | kit-inject; agentic import injected | Opus + Sonnet |
| C02 | `admin/components/MediaEditDialog/*` | UI | `admin/media/react`: `MediaInstanceEditDialog` reusing Jini validators | TipTap binding, precedence, copy, CSS | 274 | kit-inject | Sonnet |
| C03 | `admin/features/admin-themes/AdminThemes.tsx` | UI | `admin/react`: `AdminThemePicker`, `AdminThemeSchemeControl` (with row 36) | Theme list, default, i18n, persistence | 144 | kit-inject | Sonnet |
| C04 | `admin/hooks/use-list-table-cell-labels.hooks.ts` | HARDEN | `admin/react` `DataTable` cell labels + `labelTableCells` | Selector + root | 76 | none | Sonnet |
| C06 | `admin/lib/assistant-agents-snapshot.ts` | MOVE | `chat/browser/agent-inventory` (new) | Storage key | 52 | none | Sonnet |
| D03 | 8 coverage scripts | HARDEN | Existing `devops/checks/coverage` (+ changed/all-file reporting) | CLI, roots, thresholds, debt files | ~1400/2621 | Gate output before/after must match | Opus + Sonnet ×2 |
| D08 | `check-jini-registry-drift`, `check-no-linked-jini`, `diagnose-jini-typecheck-failure` | DEDUPE | Existing `devops/checks/published-types` | Project descriptors, CLI copy | 658 | Release gate: output must match | Sonnet+review |
| D09 | `stage-selected-agent-plugin-assets`, `compose-bundled-agent-plugins`, `package-agent-plugin` | SPLIT | `agent-plugins/lifecycle/node` + extend `folder-zip/node` | Package selection, dirs, env, `tovu-*.json` | ~250/460 | packaged-desktop-proof | Sonnet+review |
| D11 | `link-jini`, `unlink-jini`, `jini-links` | MOVE | `devops/local-dev`: workspace link/restore | Consumer list, state file | 239 | none | Sonnet |
| D12 | `free-port`, `port-listeners`, `load-repo-root-env` | DEDUPE | Existing `devops/local-dev` (+ `pickFreePort`) | Ranges, `.env` path | 176 | none | Sonnet |

## ACCEPT-LATER
| id | Candidate | Why later |
|---|---|---|
| B03 | Handlebars/Liquid sandboxed renderers (395 lines) → provider plugin + `TemplateRenderPort` | Real vendor integration, but it needs a render-data contract design, and its allowlists live in `features/theme`, row 162, which is hard-blocked. Do it with the theme wave |
| B08 | `platform/dev-supervisor/dev-restart.ts` (file restart requester) | Only half of a channel. The reader side lives in the dev launcher, so move both together to `devops/local-dev` |
| B09 | `contracts/site-assistant/visitor-tools*.ts` contract types (53 lines) | Types alone are low value. Move them with the visitor-tools implementation when the site-assistant work (row 168, server-port) moves |
| B10 | `platform/secrets/store-vault-guards.ts` (36 lines) | Generic but tiny. Fold into the next `platform/secrets` vault-kinds sheet rather than a separate job |
| C05 | WebMCP browser-agent preference store + panel (93 lines) | Small. It has no Jini admin WebMCP owner yet, and the website webmcp row is DELETE |
| C07 | `PushToTalkMicButton` + CSS | Voice input is parked by the owner. Do it only if row 49 (voice-input) runs |
| D01 | extraction-dossier / owner-rules / bug-class / hygiene audit engines | Belong to the **AI-Dev-Shop toolkit**, not Jini. They are still churning in the refactor, and Tovu rule presets must be stripped (AI-Dev-Shop stays generic) |
| D02 | code-metrics, check-architecture, churn hotspots, ts-escape metrics | **AI-Dev-Shop toolkit** (dev-process analysis, not host runtime) |
| D04 | test-rigor inventory + coverage-changed discovery | **AI-Dev-Shop toolkit** |
| D05 | Mutation lanes/sweep | **AI-Dev-Shop toolkit** |
| D06 | `lib/dead-path-sweep.ts` | **AI-Dev-Shop toolkit** |
| D07 | `generate-postgres-schema.ts` (Drizzle → PG) | Waits on the drizzle-orm new-dep decision; then a provider plugin (`provider-plugins/drizzle-schema`). Tovu tables stay |
| D10 | Size/complexity ratchets (`check-src-complexity-drift`, `check-size-drift`) | Real duplicate: Jini has its own `scripts/check-complexity.mjs` and `check-size.mjs` with debt JSON. Unify as one **AI-Dev-Shop** ratchet both repos call |
| D13 | `prune-tsx-cache.mjs` | Low value (86 lines). Do it with B08 in a `devops/local-dev` dev-launcher batch |
| D14 | `dev.mjs` / `dev-desktop.mjs` helpers (68 lines) | Scattered helpers; extraction costs more than the code. Same batch as B08/D13 |
| D15 | `emit-dist-package-json.mjs` `deriveDistImports` (41 lines) | Low value. Only if a second host builds conditional-import packages |

## REJECT
| id | Candidate | Reason |
|---|---|---|
| D16 | `backfill-media-slugs.ts` slug helpers → `cms/media/slug` | A one-off historical migration that froze its behaviour on purpose (no 120-char cap, per its header). Migrations are exempt (owner 10-29), and pointing it at the live Jini helper would change what a re-run produces |

## Label corrections (no new row)
- **CLASSIFY row 134 (site-chat):** drop the blocker `new-dep:micromark+micromark-extension-gfm`.
  - The Jini vanilla widget already takes an injected `renderMarkdown` (`chat/src/embed-widget/vanilla/index.ts`). Tovu's `vanilla-host.ts` should keep its micromark binding as host wiring (vendor-neutral, minimal downloads), and its file note ("markdown on its own optional subpath") should change to STAY-WIRING.
  - The row keeps kit-inject and jini-hardening-first. Codex is right that `fetch-sse` still lacks Tovu's byte-reset idle watchdog, and React embed lacks the live tool-confirmation surface.
- **CLASSIFY row 166 (composition) judged note:** add exemptions for the run finalizer (B01), the daemon transport (B05) and pending plugin credentials (B06) to "most other files … should STAY".
- **CLASSIFY-files `dev-auth.ts` note:** the "needs 2 non-core packages" reason is void. Use ports and `core/contracts/server`; see B04.
- **Owner decision 11-15 (hosted MCP → `@jini-ai/mcp`):** row 146 can lose its `owner:hosted-MCP` blocker. A02 rides with it.

## Checks that constrained the verdicts
- **Jini owners that already exist:**
  - `chat/server/run-finalizer` (226 lines; Tovu does not use it)
  - `devops/checks/coverage` (`integrity.ts` 192 lines vs Tovu's 693) and `checks/published-types` (225 lines), extracted in W3 L060a with no Tovu repoint
  - `devops/local-dev` (env and listeners)
  - `admin/core/ports/database.ts`
  - `cms/forms/express` `FormSubmitResultCodec` (an injected callback)
  - `db/tools/plan-store.ts` (a twin of the site-backup plan store)
  - `agent-plugins` `onSignInIssued`
- **Contracts in `@jini-ai/core`:**
  - `core/surface-exchanges.ts` exports `SurfaceExchange`, `SurfaceMessage` and `SurfaceExchangeStore`, so A03/A05 need no daemon import from agentic.
  - `core/contracts/vault` exports `KeyringPort` and `SecretSealerPort` for A01/B06.
  - Core already holds a stateful `InMemoryTokenStore` in `gated-mutations`, the precedent for A09.
- **Cross-package imports to inject, never import:** `agentHandle` from agentic in admin UI (C01, C03), and the sidecar `ipcRefusalReason` (B05).

## Owner questions
1. Generic dev-analysis engines (D01, D02, D04, D05, D06, D10): should they go to the **AI-Dev-Shop toolkit** (recommended; they are dev-process tools, and the D10 ratchet is already duplicated in Jini) rather than `@jini-ai/devops`? `@jini-ai/devops` would keep only host CI checks with Jini twins (D03, D08, D11, D12).
2. A09: should a **stateful** in-memory `SingleUsePlanStore<T>` go into `@jini-ai/core/gated-mutations`, beside the existing `InMemoryTokenStore`? It is not a pure helper, so the 11-15 D2 wording does not cover it. The alternative is that db and Tovu keep their own copies.
