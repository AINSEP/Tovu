# Provider audit — Tovu features + Jini capability-providers (report-only, 2026-10-21)

Trees: Tovu `e0c935bb5` / Jini `b3c4144b` (`cloud/integration-2026-10-21`). Paths: **T** = `Tovu/apps/website/src`,
**C** = `Tovu/content/agent-plugins`, **J** = `Jini/packages`. Persona: AI-Dev-Shop software-architect.

## Cross-cutting findings (read first)
1. **Trust gate decides question (2) everywhere.** Every executable seam runs through
   `defineExecutablePluginContribution` (J/agent-plugins/src/lifecycle/contribution-loader.ts:105), and the trust
   lifecycle accepts only digests in `bundled-digests.json`: "an operator-installed package … never contributes
   (owner decision 2026-09-29: third-party contributions come later)" (J/agent-plugins/src/lifecycle/trusted-plugin-files.ts:24-26,116-117).
   So "without editing core" today means "ship a plugin in C/ with a Tovu release" — no outside vendor or
   agent-authored plugin can add a provider for *any* seam. Opening that is a separate security decision (signing/allow-list), size L.
2. **Three registry shapes already exist in Jini** (media `VendorAdapterRegistry` J/integrations/src/media-providers/dispatch/vendor-registry.ts:35,
   visitor-auth registry J/capability-providers/src/visitor-auth/registry.ts:74-99, `OAuthProviderRegistry` J/oauth/src/registry.ts:80)
   plus commerce `createPaymentProviderRegistry` (J/commerce/src/payments/registry.ts:62). Add ONE keyed
   `createProviderRegistry<T>()` + `defineProviderContribution()` helper in J/core before converting more features.
3. **Tovu binds none of the Jini provider tokens** (`DeployTargetToken` J/devops/src/deploy/tokens.ts:20,
   `StorageProviderToken`/`PaymentsProviderToken` J/capability-providers/src/tokens.ts:10-14): grep of T = 0 hits.
   Selection is done by filename-keyed plugin descriptors or env/if-chains.

## Audit table
| Module | (1) generic contract + vendor adapters | (2) 3rd party adds provider w/o core edit today? | (3) default | (4) rating | (5) convert? · size · top-3 changes |
|---|---|---|---|---|---|
| **Outbound mail** (mail-status, platform/mail, resolve-mailer) | YES. `MailerPort` J/platform/src/mail/ports.ts:12; `MailAdapterModule` T/platform/mail/adapter-module.ts:11-22; plugin file `tovu-mail-adapters.json` T/features/agent-plugins/mail-adapter-registry.ts:25,55-60. Vendors: Resend (C/resend), SMTP/nodemailer T/platform/mail/adapters/smtp.nodemailer.ts, Console | Bundled plugin only (trust gate) | Accidental: first plugin by id whose credential resolves → SMTP → Console (T/server/runtime/boot/resolve-mailer.ts:90,254) | NEEDS WORK (closest to template) | **YES** (2 real vendors; Postmark/SES likely) · **M** · 1) explicit `mail.provider` setting + registry/token, SMTP default; 2) feedback half: webhook route, suppression + dedup ledgers (ports declared, unimplemented); 3) sender identity + templates — `no-reply@*.local` hard-coded (T/features/members/write-service.ts:250, newsletter/confirmation.ts:93, composition/modules/forms.ts:43) will be rejected by real providers. → `email-DESIGN.md` |
| **form-destinations** (+forms) | YES. `FormDestinationModule` T/features/form-destinations/types.ts:79-100; registry.ts:25,35; durable outbox; credential-origin-limited kit. Vendors: Cloudflare D1 receiver, Google Sheets | Bundled only (registry.ts:16-18); otherwise "nothing in core changes" (README.md:72-73) | `auto` = co-hosted receiver (select.ts:38-46) | **TEMPLATE-READY** | Already is · S · 1) lift types into J/cms/forms; 2) email notification as a built-in push destination over `MailerPort`; 3) trust decision |
| **deployments** — static targets | YES. `DeployTargetModule` T/features/deployments/deploy-targets/types.ts:76-102 (extends J/devops); `tovu-deploy-targets.json` registry.ts:36,46-51. Vendors: Cloudflare Pages/Workers, Vercel, Netlify, GitHub Pages, S3-compatible | Bundled only | YES: `defaultForNewDestination` types.ts:83 (cloudflare-workers) | **TEMPLATE-READY** | No new layer · S · 1) unify with J/devops `DeployTargetModule`/`DeployTargetToken` (Tovu re-declares via `Omit`, types.ts:66,76); 2) make "domain-capable" a declared capability, not magic `customDomain`/`zoneId` fields (publish-agent-tools.ts:220,1041); 3) delete dead `DeploymentProviderPort` (ports.ts:108-125, github.ts:441, no consumer) |
| deployments — ops/configs | `tovu-deploy-ops.json` deploy-ops/registry.ts:10,75; `tovu-deploy-configs.json` deploy-config-registry.ts:12 (Fly, GitHub, Railway, Render) | No — extra owner allow-list (deploy-ops/registry.ts:138-142) | none (caller picks; `requirePlatform` :149) | NEEDS WORK (deliberately double-locked) | Keep · S · drop allow-list when trust lands |
| **domain-dns** | Read-only. J/diagnostics/src/domain-dns/index.ts:9-31; single inline Cloudflare-DoH adapter T/server/runtime/composition/domain-dns-adapters.ts:63,68; built in tool-catalog-manifest.ts:381-390. Writes only inside C/cloudflare/lib/{dns,domains}.mjs | No (no token, no plugin file) | Implicit DoH resolver + TLS HEAD | NEEDS WORK (resolver) / HARD-WIRED (writes = Cloudflare only) | **YES** (Route53, Vercel DNS, registrars are real) · **M** · 1) Jini `DnsProvider` contract + core planner, `manual` default; 2) lift Cloudflare's fingerprint/approval protocol (domains.mjs:49-58) into core; 3) persist provider-required records at publish for real verification. → `dns-DESIGN.md` |
| **source-control** | YES. J/devops/src/source-control/contracts.ts:23-74; Tovu loader T/features/source-control/provider-registry.ts:34,66-90 (`tovu-source-control.json`). Vendor: GitHub | Bundled only; switched-off reported (:60) | Default *connection* (store.ts:245-246); no default provider | **TEMPLATE-READY** | Already is · S · 1) add GitLab/Gitea plugin to prove it; 2) default-provider rule; 3) trust decision |
| **site-backup** — repo push | Reuses source-control seam (push-engine.ts:3; contracts.ts:17-21) | Yes via SCM plugin (bundled) | default connection (tool-registrations.ts:431) | **TEMPLATE-READY** | No · S |
| site-backup — share/export delivery | `ArtifactStorePort` J/devops/src/core/artifact-store.ts:8-13; only s3-compatible implements | No: `provider !== "s3-compatible"` (share-hosting.ts:112-119), `.get("s3-compatible")` (T/server/runtime/composition/deps.ts:2762-2777) | ZIP download fallback | HARD-WIRED | **YES** · M · select any target exposing `createArtifactStore`; fold into one object-store contract (below) |
| **storage** (media blobs) | `BlobStorePort` J/cms/src/media/ports.ts:112; `LocalFsBlobStore` + `S3BlobStore` T/features/media/blob-store.s3.ts:105 | No: env `TOVU_MEDIA_BLOB_STORE=local\|s3`, throws otherwise (deps.ts:410-440) | local | NEEDS WORK | **YES** · M · 1) converge 4 blob contracts (cms BlobStore, capability-providers Storage, devops ArtifactStore, s3 plugin) into one object-store contract; 2) keyed registry, default local; 3) share one bucket credential between media and shares |
| **media-generation** | YES. `VendorAdapter`/registry J/integrations/src/media-providers/dispatch/vendor-registry.ts:35; 13+ adapters (OpenAI, BFL, fal, Leonardo, ComfyUI, ElevenLabs, MiniMax…) | No: registry rebuilt per call (T/features/media-generation/tool-registrations.ts:143); closed const catalogue `MEDIA_PROVIDERS`/`IMAGE_MODELS` (providers.ts:46,85) enforced by engine.ts:181 | `gpt-image-2` / first configured (tool-registrations.ts:131) | NEEDS WORK | **YES** (most multi-vendor area) · M · 1) provider contributes `{provider, models[], adapter}` as one unit; 2) build registry once at composition, builtins = default plugin, plugin loader like mail; 3) tool model enum from live registry |
| **analytics** (sink) | YES. `AnalyticsSinkPort` T/features/analytics/ports.ts:56; Local/SQLite sinks (jini-adapters.ts:77, analytics-sink.sqlite.ts:10) | No: hard-coded per root (deps.ts:2364, app.ts:1357); `ForwardingSink` unbuilt; `beforeIngest` hook unwired (ports.ts:153) | SQLite | NEEDS WORK | **YES** (Plausible/PostHog/GA4 likely) · M · 1) keyed sink registry + `analytics.sink` setting, composite fan-out sink; 2) plugin contribution for sinks; 3) wire `beforeIngest` |
| **web-screenshot** | YES. `PageCapturePort` T/features/web-screenshot/web-screenshot.ts:90; Playwright + desktop adapters (createPageCaptureForHost :52) | No (tool-catalog-manifest.ts:468) | Playwright | NEEDS WORK (low) | Maybe, later · S · keyed factory; share with sites/site-preview `UrlCapturePort` duplicate |
| **identity** — admin sign-in | No provider layer: argon2id + sessions + API keys (T/features/identity/INFO.md:9-14; wiring.ts:8) | No | local password | HARD-WIRED | Only if SSO is on roadmap · M · reuse J/oauth OIDC + visitor-auth registry; keep password default |
| identity — outbound OAuth | YES, descriptor data. J/oauth/src/registry.ts:80,89; T/server/runtime/composition/agent-plugin-connections.ts:129 | **YES** — descriptors need no code (T/platform/oauth/index.ts:6-10) | n/a | **TEMPLATE-READY** | No change |
| **consent** | Engine J/cms/src/consent; `ConsentRecordPort` (types.ts:51-54) + file adapter (node/index.ts:121); chosen in T/server/runtime/composition/site-consent.ts:21-22 | No plugin path | file receipts + built-in banner | adequate (NEEDS WORK only if CMP wanted) | **NO** (no 2nd vendor) · S · DB/D1 receipt adapter; bind via token |
| **members** | Repo/service ports T/features/members/ports.ts:47-219; magic-link auth hard-wired; billing deferred | No auth/billing seam; Jini Stripe/visitor-auth unused (0 hits) | magic link + sqlite | HARD-WIRED (auth/billing), repos fine | Partial · M (when paid tiers ship) · adopt Jini payments contract (commerce kernel), optional sign-in provider seam, move Console mailer to platform/mail |
| **webhooks** (outbound) | Generic J/integrations webhooks (T/features/webhooks/ports.ts:27); keyring/sealer fixed (deps.ts:179,182) | n/a | HMAC signer | TEMPLATE-READY contract, runtime incomplete | **NO vendor layer** · S · start `processDueDeliveries` worker (never started, capability-inventory.ts:302); register `webhooks.beforeDispatch` from plugins; close envelope-storage gap |
| **J capability-providers** | 5 single `token<T>` ports (tokens.ts:10-14) + adapters jwt-auth, blob-storage, stripe, sqlite, ws; visitor-auth registry (metadata-only Google/Facebook) | Structurally yes (implement + bind), but no keyed registry/manyToken/plugin path | none | NEEDS WORK (orphaned: no consumer in Tovu; duplicates live contracts) | Partial merge · M · 1) fold Storage into the object-store contract, mark Auth/Db experimental; 2) keep visitor-auth + payments; 3) host the shared `createProviderRegistry<T>` + manyToken contributions |

## Conversion ranking
| # | Module | Why first | Size |
|---|---|---|---|
| 0 | Shared `createProviderRegistry<T>` + `defineProviderContribution` (J/core) | Removes the 4th/5th copy of the registry before conversions start | S |
| 1 | Outbound mail | 2 real vendors, seam 70% built, live bug (`*.local` senders), bounces/suppression missing | M |
| 2 | Domain / DNS | Real 2nd vendors; approval protocol trapped in one plugin; enables non-Cloudflare custom domains | M |
| 3 | Object storage (media blobs + backup share) | 4 overlapping contracts, env/if-chain + hard-coded `s3-compatible` | M |
| 4 | Media generation | 13+ vendors behind a closed catalogue; plugins can't add one | M |
| 5 | Analytics sink | Likely vendors; seam exists, selection hard-coded | M |
| 6 | Webhooks runtime gaps (no vendor layer) | Worker never started — correctness, not abstraction | S |
| 7 | Search (new) | Greenfield on the template → `search-DESIGN.md` | M |
| — | Later/only on demand | web-screenshot (S), members payments (when paid tiers), admin SSO (if roadmap), consent CMP (if demand) | — |
| — | Leave as is | form-destinations, source-control, deploy targets, outbound OAuth, site-backup repo push | — |

## Reference TEMPLATE
1. **form-destinations** — full shape: contract (types.ts:79-100) + `defineExecutablePluginContribution` registry
   (registry.ts:25,35) + per-binding durable outbox + constrained kit + `auto` default. Copy for anything that
   delivers data outward.
2. **source-control** — same plugin seam but with the **contract living in Jini** (J/devops/src/source-control/
   contracts.ts:23-74) and the loader in Tovu (provider-registry.ts:34,66-90): the right repo split.
   Provider discipline (open string id, typed never-thrown errors, pre-resolved per-provider credentials, guarded
   `httpClient`, registry throws at boot) should be copied from **J/commerce/src/payments/{ports,registry}.ts**,
   which is consistent with the commerce debate verdict.

## Notes
- Evidence gathered by three read-only Opus subagents and spot-checked; line numbers are at the trees above.
- Not verified at runtime (no build/run, by design).
