# Vendor-specific code in core — inventory (2026-09-27)

Read-only inventory. Method: grepped `git ls-files apps packages` (tracked files, tests/fixtures/node_modules
excluded) case-insensitively for a vendor-name list, plus a hardcoded-external-host scan, then opened the
files that mattered to separate real vendor coupling from English-word/CSS-class/package-lock noise. Raw
per-file hit counts were NOT trusted as-is — several of the largest raw counts (`plausible`=25, `sentry`=6,
`replicate`=6) turned out to be pure regex false positives on English words ("a port needs two **plausible**
adapters", `Merged**S**ecrets**Entry**` containing "sEntry", "**replicate**s this behavior"); see the per-vendor
notes below for what each count actually was.

## Rerun commands

```bash
# Tracked, non-test core files
git ls-files apps packages | grep -v -e __tests__ -e '\.test\.' -e fixtures -e node_modules > /tmp/tovu-core-files.txt

# Per-vendor file-count sweep (edit the names/pats arrays to add vendors)
names=(composio supabase github vercel netlify flyctl "fly.io" cloudflare "render.com" railway stripe shopify \
  paypal higgsfield openai anthropic gemini deepseek openrouter elevenlabs replicate "fal.ai" resend sendgrid \
  mailgun postmark twilio slack discord notion airtable zapier "make.com" n8n aws r2 gcs algolia mapbox \
  "cal.com" calendly hubspot mailchimp figma linear jira sentry posthog plausible umami google-analytics)
pats=(composio supabase github vercel netlify flyctl 'fly\.io' cloudflare 'render\.com' railway stripe shopify \
  paypal higgsfield openai anthropic gemini deepseek openrouter elevenlabs replicate 'fal\.ai' resend sendgrid \
  mailgun postmark twilio slack discord notion airtable zapier 'make\.com' n8n '\baws\b' '\br2\b' '\bgcs\b' \
  algolia mapbox 'cal\.com' calendly hubspot mailchimp figma linear jira sentry posthog plausible umami \
  'google[ -]analytics')
for i in "${!names[@]}"; do
  cnt=$(grep -liE "${pats[$i]}" $(cat /tmp/tovu-core-files.txt) 2>/dev/null | wc -l)
  echo "$cnt ${names[$i]}"
done | sort -rn

# Hardcoded external API hosts (catches vendors not in the name list above)
grep -ohE "https://[a-zA-Z0-9._-]+\.(com|io|dev|ai|net|org)" $(cat /tmp/tovu-core-files.txt) 2>/dev/null \
  | grep -v dist-debug | sort | uniq -c | sort -rn | head -60

# List a specific vendor's actual (non-dist, non-migration-snapshot) files, to eyeball before trusting the count
grep -liE "<vendor>" $(cat /tmp/tovu-core-files.txt) | grep -v dist-debug | grep -v 'drizzle/meta'
```

## Existing plugins (for reference)

`content/agent-plugins/`: `github`, `higgsfield-media`, `jev`, `site-compliance`, `supabase`, `tovu-deploy-fly`,
`tovuize-site`.

## (a) SHOULD BE A PLUGIN — ranked by payoff

| Rank | Vendor | Category | Files (real) | What it is | Suggested plugin id | Size |
|---|---|---|---|---|---|---|
| 1 | **Composio** | (a) | ~83 non-migration source files + 4 migrations + ~44 migration-meta snapshots | An entire third-party "connect any SaaS account" broker baked straight into core: two DB tables (`composio_config`, `composio_connector_credentials`), a dedicated OAuth callback route (public, outside `requireAdminSession`), 8 admin routes (`server/inbound/admin-http/routes/connectors/*`), a singleton `ComposioConnectorService`/`ComposioConnectorProvider` (`platform/connectors/*`), and 3 admin UI surfaces (Settings → Connectors tab, Security → "Other credentials", Providers). Every string that made "notion/slack/discord/stripe/jira/hubspot/sendgrid/twilio" show up in the raw vendor sweep turned out to be Composio's own live catalog (fetched at runtime), not separate Tovu code — so this one entry actually explains ~10 of the "vendor hits" in the raw counts. | `composio` | **L** — biggest single item found; bigger than Supabase's footprint (2-3x the file count), touches 3 DB schema dialects + migrations, needs its own OAuth callback route surface, and has 3 separate admin-UI touch points (Settings, Security, Providers) to peel off cleanly. |
| 2 | *(nothing else qualifies)* | — | — | Every other vendor hit that looked plugin-shaped on the raw count turned out, on inspection, to be either noise or an already-generic core capability (see tables below). No second real candidate surfaced in this pass beyond Composio and the Supabase work already in flight. | — | — |

**One clear winner.** Composio is the only vendor integration in core matching the owner's rule ("a site owner opts into one specific SaaS's tools/credentials/workflows") that isn't already a plugin or already generic. Recommend treating it exactly like the in-flight Supabase move, just bigger: DB tables + OAuth route + 3 admin UI screens need to travel together.

## (b) LEGIT CORE — generic interface, vendor is one implementation

| Vendor(s) | Interface | Files/dirs | Verdict |
|---|---|---|---|
| GitHub (git ops) | `GitHubCommitAdapter` port (`features/source-control/commit-site.ts`) with one adapter (`github-git-provider.ts`); `SourceControlProviderId = "github"\|"gitlab"\|"bitbucket"` closed union (`features/source-control/types.ts`) | `features/source-control/*`, `features/site-backup/github-push.ts`, `features/deployments/providers/github.ts`, `features/custom-credentials/github-write-files.ts` | **Debatable but core.** Port+adapter shape is right; GitHub is just the only adapter written so far (no GitLab/Bitbucket git-ops adapter exists yet, only credential storage). This is a CMS backup/source-control capability the product needs regardless of host, not an agent-connector marketplace entry — different in kind from Composio. The `github` **plugin** is correctly just a skill layer teaching an agent to use these already-generic tool registrations (`site-backup`/`source-control`/`deployments` `tool-registrations.ts`) — not a duplicate implementation. No overlap/duplication found; the split is already correct. |
| GitHub Vercel Netlify Cloudflare-Pages S3-compatible (AWS S3 / R2 / B2 / Spaces / Wasabi / MinIO) | `DeployTarget`/`StaticPublishTargetId` closed union (`features/deployments/static-publish/types.ts`, `adapter.ts`, `s3-compatible-target.ts`) | `features/deployments/static-publish/*`, `features/deployments/publish-credentials/*`, `features/media/blob-store.s3.ts` | **Core.** This is the site owner's own "publish my static export somewhere" feature — 5 named targets behind one interface, S3-compatible already generalizes 6 vendors into one adapter. Closed union (each new target needs a core edit), unlike `lipay`'s open registry for payments — a real, minor design debate, but not vendor lock-in worth relocating. |
| Anthropic OpenAI Gemini DeepSeek OpenRouter | BYOK provider seam (`assistant/byok-provider-turn.ts`, `byok-credential.ts`, `execution-mode-settings.ts`) | `apps/website/src/assistant/*`, `server/runtime/composition/modules/assistant-byok.ts` | **Core.** Confirmed generic multi-provider LLM credential seam; matches existing `live_byok_turn_stub_provider_verification` finding. |
| OpenAI/Nano-Banana/Grok/Volcengine/ImageRouter/SenseAudio/OpenRouter/AiHubMix + ~10 more (fal, leonardo, bfl, replicate, google, kling, midjourney, comfyui, suno, udio, ElevenLabs, xAI Grok Imagine) | `MediaProvider`/`mediaVendorRegistry` catalog (`@jini-ai/integrations/media-providers`, `dispatch/vendor-registry.ts`) | `features/media-generation/*`, `apps/admin/.../media-provider-catalog.ts` | **Core, deliberately wide.** A single BYOK-style catalog covering dozens of image/video/audio-gen vendors by raw API key, no OAuth/MCP per vendor. This is why `elevenlabs`/`replicate` showed up in the raw sweep — they're catalog entries (several `integrated: false`, i.e. listed but genuinely unwired), not separate integrations. Splitting this into per-vendor plugins would fragment a coherent "one interface, many keys" feature the owner's own rule treats as the *good* pattern — leave it. |
| Resend (+ SMTP via nodemailer) | `MailerPort` (`platform/mail/ports.ts`) | `platform/mail/adapters/http-api.resend.ts`, `smtp.nodemailer.ts` | **Core, tiny.** One adapter file behind a 2-adapter port. Everywhere else "resend" hit was the English verb ("resend the confirmation email", "resend a magic link") — noise, not the vendor. Postmark is mentioned only in a doc comment as a same-shape alternative, never implemented. |
| Fly.io, Railway, Render (`deploy-config-render.ts` name only) | `tovu deploy config --target <fly\|railway\|...>` CLI scaffold generator (`features/deployments/deploy-config*.ts`) | `apps/website/src/cli/commands/deploy-config.ts` + per-target renderers | **Core, different actor.** This generates IaC files (`fly.toml`, `railway.json`) for the *operator self-hosting Tovu itself* — a dev-ops CLI shipped with the product, not a site-owner-facing SaaS connector. Same category as the static-publish targets. |
| Fly.io | "Zero-setup publishing auth" codec (`features/publish-trust/provisioning.fly-toml.ts`) | `features/publish-trust/*` | **Core**, same self-hosting-operator category as above; explicitly a "codec, not a branch" — designed to add more hosts later without new branches. Worth noting only because it's conceptually adjacent to (but distinct in purpose from) the `tovu-deploy-fly` **plugin**, which drives fly.io deploys for an already-running instance via the agent. No duplication found — different lifecycle stage, different actor. |
| Many vendor names in `secret-patterns.ts`/`secret-redaction.ts` (Anthropic, OpenAI, GitHub, Slack, AWS, npm, …) | Generic secret-shape redaction list | `contracts/core/secret-patterns.ts` | **Core.** A security feature that must know well-known API-key *shapes* to redact them from logs — vendor names are just regex labels, not integrations. |
| External MCP federation mentioning "Higgsfield" | Generic remote-MCP client (already the subject of the `remote_http_mcp_client_exists` finding) | `assistant/mcp-federation/*`, `features/external-mcp/*`, `features/agent-plugins/*` | **Core, already correctly generic.** Higgsfield only appears in a demo fixture (`demo-image-tool.ts`/`demo-image-png.ts`) and search keywords pointing at the real `higgsfield-media` plugin. No leftover Higgsfield-specific logic in core. |
| Supabase | Already in progress | `platform/connectors` overlap area, `apps/website/src/assistant/external-mcp-*` | Out of scope here — active peer agents (`supabase-plugin-plan`/`supabase-slice0`/`supabase-slice1`) are already moving this; not re-audited. |

## (c) NOISE — false positives from the raw sweep

| Raw hit | Real source |
|---|---|
| `plausible` (25 files) | The English adjective ("two **plausible** adapters", "a **plausible** rendering") — analytics feature is self-hosted/generic (`AnalyticsSinkPort`/`ForwardingSink`), never the Plausible.io product. |
| `sentry` (6 files) | Substring match inside `Merged**S**ecrets**Entry**`, `Headless**Entry**Kind`, etc. — no Sentry SDK or error-tracking vendor anywhere in core. |
| `replicate` (6 of 6 outside the media catalog) | The English verb ("**replicate**s this behavior", "copy duplicate clone **replicate**"). |
| `stripe`, `paypal` | Only ever appear as (1) a naming-convention citation ("matching Stripe's own convention" for lowercase ISO-4217 codes, "Stripe-shaped" webhook signatures) and (2) a disabled placeholder badge in `Payments.tsx`. `lipay` (the actual generic payments framework, deliberately Stripe/PayPal-agnostic — see its own header) has **no** Stripe or PayPal gateway implementation in core today; those would be `lipay` plugin gateways if/when built. |
| `n8n` | One doc-comment citation ("the n8n deploy guide's identical advice"). |
| `figma`, `discord`, `notion` (bulk of it) | Icon-font CSS class names (`remixicon.css`) and the plain English word "notion" ("the notion of..."). |
| `jira`, `hubspot`, `mailchimp`, `sendgrid`, `mailgun`, `twilio`, `airtable`, `zapier`, `make.com`, `calendly`, `cal.com`, `algolia`, `mapbox`, `render.com`, `fal.ai`, `gcs`, `google-analytics`, `umami`, `posthog` | Zero hits in core. (Some of these — notion/slack/discord/stripe/jira/hubspot/sendgrid/twilio — DO exist as connector IDs, but only inside Composio's own live catalog fetched at runtime, not as separate Tovu code; see Composio above.) |
| `linear` | Every hit is `linear-gradient`/CSS, not the issue tracker. |
| npmjs.org / github.com / opencollective.com hosts (1520/308/218 hits) | `package-lock.json` metadata (registry/repo/funding URLs) — not integration code. |

## Summary for dispatch

- **(a) ranked by payoff:** Composio — one entry, but it's the largest vendor-coupled surface in core (DB schema × 3 dialects + 4 migrations, a public OAuth callback route, 8 admin routes, 3 admin-UI screens). Nothing else qualified.
- **(b) debatable-as-core:** GitHub git-ops (port+adapter, only one adapter exists — fine, but worth knowing GitLab/Bitbucket are typed and unimplemented); the static-publish `DeployTarget` union (closed, unlike `lipay`'s open payment-provider registry — a minor design inconsistency, not urgent); `publish-trust`'s fly.io "zero-setup" codec (conceptually adjacent to, but not duplicating, the `tovu-deploy-fly` plugin).
- **Rerun:** the four commands under "Rerun commands" above reproduce this whole pass from a clean checkout.
