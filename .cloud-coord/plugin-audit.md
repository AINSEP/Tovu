# Bundled agent plugin audit — 2026-10-22

Programmer + Code Inspection (Execution): implementation and package-boundary review, using the loaded personas and skill-creator guidance.

Scope: all **21** directories under `content/agent-plugins/`, plus final source in `apps/website/src` and `apps/admin/src` for vendor ownership. No tests, installs, dev servers or Git mutations were run. Other workers' edits in `apps/**` were left alone. Resend's contribution descriptor and every protected file in the dispatch were left untouched.

Evidence: read plugin manifests, skills, contribution descriptors, module exports, shipped tests and the host loading/auth paths. A TypeScript AST scan of 89 non-test `.mjs` files found 157 imports and no runtime imports outside their owning plugin (apart from Node built-ins). Every declared contribution module exists. All MCP configs parse as JSON and none embeds credential values/headers. These are static observations, **not test passes or external-service verification**. Existing descriptions of vendor prices/entitlements remain historical guidance; live service claims were not re-verified.

The graph MCP tools are unavailable. The checkout lacks the mandated architecture chapter 13/14 files, project memory and governance ADR index; the requested persona roster/files were available at `/Users/la/Programming/Tovu/AI-Dev-Shop/`. Jini's installed `@jini-ai/agent-plugins`, `@jini-ai/platform`, `@jini-ai/devops` and `@jini-ai/search` source/contracts were inspected. No new architecture or ownership boundary was introduced. Coordinator should resolve the missing governance sources before any follow-up boundary change.

## Plugin findings

Paths in this table are relative to `content/agent-plugins/<plugin>/` unless prefixed with `apps/`.
The audit checked runtime containment, vendor ownership, cross-plugin imports, cards where supported, descriptions, skills, MCP secrets/auth and packaged tests for each row. “No defect found” is limited to these static checks.

| plugin | finding | severity | fixed (file) / not fixed (why) |
|---|---|---|---|
| cloudflare | Workers/Pages/D1 implementations and permissions live together; relative runtime imports stay inside package; empty MCP config; 15 existing test files. Hosting descriptors own credential fields but lack full mail-style card copy. | Follow-up | Not fixed: deployment card mechanism expansion is excluded; retain `publish-host` flow. |
| composio | Hosted OAuth is correctly declared; skill bypassed the generic plugin connect lifecycle; no packaged tests. | Required | Fixed `skills/composio/SKILL.md` to use `agent_plugin_connect`, bounded waiting and tools-only setup; added `__tests__/connection-contract.test.mjs` for OAuth/no-secret and remote-code-tool exclusions. |
| fly | Operations, config generator, credential scheme and tests are packaged; no runtime import of GitHub or another plugin. The skill delegates GitHub work through tools, not imports. Fly key collection still uses generic API credentials. | Follow-up | Not fixed: no full credential-card mechanism for the operations/credential-scheme contribution. Existing 12 test files retained. |
| github | Source control, backup, Actions operations and their permissions/tests are packaged; runtime imports stay inside package; MCP is intentionally empty. Source-control token fields exist, without a full card block. | Follow-up | Not fixed: source-control card expansion is excluded. Existing 9 test files retained; corresponding core ownership issues are below. |
| github-pages | Runtime target and test are packaged. JSDoc imports `DeployHostKit` from a checkout-relative core path; this is not a runtime cross-plugin import. | Recommended | Not fixed: the host's legacy positional kit differs from Jini's current object API; moving that compatibility type to its shared owner requires a boundary follow-up, not a duplicate local type. Credential card gap listed below. |
| google-workspace | OAuth connection, Sheets tools, admin surfaces and form destination live inside plugin, with 29 existing test files and no MCP/inline token. BYO OAuth client and Picker operator key setup do not have full plugin-card copy. | Follow-up | Not fixed: API-connection/BYO-client card expansion is excluded. Existing connection-specific panel remains the normal Google sign-in surface. |
| higgsfield-media | Skill/manifest still described manual setup as the normal cold start and advertised only image generation in the manifest despite video guidance; no packaged tests. Hosted OAuth and read-trust metadata are correctly split between manifests. | Required | Fixed `plugin.json`, `skills/higgsfield-media/SKILL.md`: normal plugin connect card, manual recovery distinguished, tools-only use, current discovery over historical model examples. Added `__tests__/connection-contract.test.mjs`. Historical recovery constraints and their explanations retained. |
| how-tovu-works | Missing authoring skill and packaged tests. No explicit skills list exists: lifecycle discovers `skills/*/SKILL.md`. | Required | Added `skills/build-agent-plugin/SKILL.md`, linked it from `skills/how-tovu-works/SKILL.md`, updated `plugin.json` description/keywords. Added `__tests__/bundled-package.test.mjs` proving seeding exposes both skills through the installed guidance tool and checking site-guide declarations. |
| jev | Correctly advertises design/code guidance only, no chat MCP; API key is operator-managed outside chat. No packaged tests. | Required | Added `__tests__/bundled-package.test.mjs` for packaged API references, empty MCP and no fabricated chat execution. No card added for an external-code-only integration. |
| meilisearch | Provider owns requests, error mapping and public-content boundary, with injected HTTP; no tests inside package. Host/API key setup has no full card. | Required / follow-up | Added `__tests__/provider-contract.test.mjs`: guarded request/auth/result, missing credentials, and restricted-document refusal without network. Card mechanism remains follow-up. |
| netlify | Self-contained static target, accurate scope, empty MCP and existing target test. Credential metadata is plugin-owned, full card copy unsupported. | Follow-up | Not fixed: deployment card expansion is excluded. No other defect found in static checklist. |
| railway | Config-only contribution correctly described, but skill presented a CLI command without distinguishing chat from a coding environment. Existing generator test is packaged. | Required | Fixed `skills/railway/SKILL.md`: coding-agent/operator command only, no Bash from chat, explicitly no config-generation chat tool or deployment adapter. |
| render | Config-only contribution correctly described, but skill presented a CLI command without distinguishing chat from a coding environment. Existing generator test is packaged. | Required | Fixed `skills/render/SKILL.md`: coding-agent/operator command only, no Bash from chat, explicitly no config-generation chat tool or deployment adapter. |
| resend | Only bundled mail adapter; schemaVersion 2 already supplies title, intro, help URL/label, sending-key hint and base URL. Sending vs MCP keys are correctly distinguished. OAuth is in plugin metadata; token help/probe in MCP config. Three packaged tests already exist. | Info / follow-up | Descriptor deliberately untouched. Added vendor-neutral repo enforcement at `apps/website/src/features/agent-plugins/__tests__/unit/bundled-mail-credential-cards.unit.test.ts`. MCP fallback and webhook-secret full-card gaps remain below. |
| s3-compatible | Target/object-store implementation and tests are packaged. JSDoc imports the checkout-relative legacy host-kit type, not a runtime import. | Recommended / follow-up | Not fixed: shared legacy type ownership requires coordinator follow-up (same reason as github-pages); full card extension for access key ID/secret is excluded. Existing 3 test files retained. |
| site-compliance | Correctly describes evidence-based screening, not certification; no MCP and no packaged tests. | Required | Added `__tests__/bundled-package.test.mjs` for packaged rulepacks, citation/uncertainty contract and empty MCP. Existing runtime evidence remains owned by host tools. |
| site-import | `plugin.json` description/summary promised mandatory plan approval while the actual skill authorizes draft imports from the request and only reviews plans on request. No packaged tests. | Required | Fixed `plugin.json` description/summary to match actual behavior. Added `__tests__/bundled-package.test.mjs` for packaged mapping references, draft/untrusted-input contract and accurate approval description. |
| supabase | Hosted OAuth plus token fallback help/probe are declared; imported environment token is a variable name, not a secret. No packaged tests. Existing legacy MCP auth metadata remains supported by the host parser. | Required / follow-up | Added `__tests__/connection-contract.test.mjs` for hosted endpoint, OAuth, token metadata, no inline headers/env and secure recovery. Full token-card copy is a follow-up. |
| tovu-theme | Tools are documented, but compiled-theme shell examples needed a clear coding-agent/operator boundary. No packaged tests. Content mapping guidance intentionally calls on the site-import knowledge owner; no runtime plugin import exists. | Required | Fixed `skills/tovu-theme/SKILL.md` with chat tools-only rule and coding-environment handoff. Added `__tests__/bundled-package.test.mjs` for v2 references/native authoring tools. |
| ui-ux-design | Bundled skills lacked in-app tool/runtime context; shadcn frontmatter allowed Bash; `web-compliance` lacked skill frontmatter; no packaged tests. | Required | Fixed `skills/ui-ux-design/SKILL.md` with guidance/reference loading and optional checkout-specific context, `skills/shadcn-ui/SKILL.md` with chat/checkout distinction and no Bash permission, and `skills/web-compliance/SKILL.md` with name/description. Added `__tests__/bundled-package.test.mjs` for all seven entrypoints and their linked packaged references. |
| vercel | Runtime target/test are packaged; JSDoc imports checkout-relative legacy host-kit type. Credential fields exist, full card block unsupported. | Recommended / follow-up | Not fixed: moving shared compatibility type needs coordinator follow-up, and deployment card expansion is excluded. No runtime plugin-to-plugin import found. |

## Vendor code still in core

All rows below are **not fixed in this job**, as directed. API logic/branches take priority over vendor-specific examples/copy. Generic “resend a message” verbs, license/provenance URLs, historical comments, generated migrations and AI model/media vendors were excluded from actionable findings. Existing vendor tests in core remain migration follow-ups alongside their owners; they were not moved or rewritten.

| file | vendor | suggested plugin |
|---|---|---|
| `apps/website/src/features/deployments/providers/github.ts:38` | GitHub App JWT minting, API origin/headers, deployment-status mapping | `github` (keep generic deployment port in core/Jini) |
| `apps/website/src/features/deployments/index.ts:24` | GitHub provider export | `github` contribution wiring |
| `apps/website/src/features/source-control/store.ts:22` | Closed GitHub/GitLab/Bitbucket list and Bitbucket-specific username/token transitions | `github`; future `gitlab` / `bitbucket` |
| `apps/website/src/features/source-control/types.ts:33` | Closed vendor credential union | Same provider plugins; core should consume declared credential shape |
| `apps/website/src/features/source-control/commit-site.ts:221` | Hard-coded `github` export staging directory | `github` or provider-supplied storage namespace |
| `apps/website/src/server/runtime/composition/app.ts:1623` | Explicit GitHub-only source contribution selection | `github` descriptor through generic source discovery |
| `apps/website/src/server/runtime/composition/domain-dns-adapters.ts:68` | Hard-coded Cloudflare DNS-over-HTTPS service | `cloudflare` via injected DNS resolver port (preserve diagnostic availability policy) |
| `apps/website/src/features/publish-trust/connect.ts:51` | Fly/Render/Railway/GitHub config candidate filenames | Corresponding deploy plugins, descriptor-contributed filenames |
| `apps/website/src/server/runtime/boot/boot-readiness-warnings.ts:47` | `FLY_APP_NAME` hosting detection and label | `fly` contributed hosting signal |
| `apps/website/src/features/agent-plugins/deploy-split-activation.ts:17` | Hosting vendor list and Cloudflare-specific activation migration | Hosting plugin supersession declarations; preserve operator disable decisions during migration |
| `apps/website/src/features/agent-plugins/bundled-catalog.ts:28` | Seed policy, retirement/replacement vendor lists | Bundled plugin metadata; coordinator must preserve existing activation/upgrade semantics |
| `apps/admin/src/features/sites/Sites.hooks.tsx:253` | Supabase-specific option union, lookup and disclosure branches | `supabase` contributed database option |
| `apps/admin/src/features/sites/CreateSiteOnboarding.tsx:210` | Supabase-specific input/label identifiers | `supabase` option metadata rendered generically |
| `apps/admin/src/features/sites/sites-i18n.ts` | Supabase field translations and named provider examples | `supabase` descriptor translations / generic custom-provider copy |
| `apps/website/src/server/inbound/public-http/http/site/render.ts:3216` | Google Fonts URL construction/preconnects | `google-fonts` (new) or theme-provided font resources |
| `apps/website/src/contracts/core/public-page-security-headers.ts:17` | Google Fonts/jsDelivr CSP hosts | Theme/plugin resource policy (keep CSP enforcement generic) |
| `apps/admin/src/admin-themes/classic/admin.css:1` | Google Fonts import | Theme-local font assets or `google-fonts` |
| `apps/admin/src/admin-themes/classic/manifest.json:15` | Google Fonts stylesheet URLs | Theme-local font assets or `google-fonts` |
| `apps/website/src/features/skills/install-tool.ts:43` | GitHub-only installer surface and URL checks | `github` source adapter around generic skill installation |
| `apps/website/src/server/inbound/admin-http/routes/skills/manage.ts:18` | GitHub URL source field and error text | Generic skill-source handler + `github` metadata |
| `apps/admin/src/features/skills/Skills.tsx:24` | GitHub URL form/copy | Generic skill-source selector + `github` metadata |
| `apps/admin/src/features/skills/SkillRow.tsx:26` | Every source link labelled GitHub | Source-provided display label (`github` today) |
| `apps/website/src/contracts/headless/assistant-tool-approval-policy.ts:43` | GitHub-specific skill-install action IDs | Generic source-action IDs + `github` contribution (preserve approval coverage) |
| `apps/admin/src/features/source-control/SourceControl.tsx:82` | Named GitHub/GitLab/Bitbucket handle guidance | Provider descriptor copy |
| `apps/admin/src/features/plugins/AddAgentPluginPanel.tsx:67` | GitHub-only URL examples | Generic archive/source example or source contribution |
| `apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx:122` | GitHub example label | Generic example; vendor copy belongs in relevant widget/plugin |
| `apps/admin/src/features/security/AccessTokensTab.tsx:849` | Fly API host placeholder and multi-host help text | `fly` credential guidance; keep generic additional-host control |
| `apps/admin/src/features/security/security-i18n.ts` | Fly-specific multi-host translations | `fly` credential guidance |
| `apps/website/src/features/custom-credentials/custom-credential-create-ui.ts:85` | GitHub/name.com examples | Plugin credential card / neutral generic fallback (protected path) |
| `apps/website/src/features/custom-credentials/credential-save-tool.ts:30` | Stripe/Mailchimp/Fly/GitHub/Supabase examples | Relevant plugin credential guidance (protected path) |
| `apps/website/src/features/custom-credentials/agent-tools.ts:115` | GitHub owner/repo-specific write-files input descriptions | `github` tool contribution (protected path) |
| `apps/website/src/assistant/credential-guidance.ts:5` | Stripe/Mailchimp/Fly examples | Plugin-owned key guidance, neutral host fallback |
| `apps/website/src/features/agent-plugins/tool-registrations.ts:793` | Fly search example | Neutral plugin search example or contributed discovery text |
| `apps/website/src/features/mail-status/agent-tools.ts:14` | Resend provider example | `resend` contribution / neutral provider-id example (protected path) |
| `apps/website/src/features/deployments/deploy-ops/agent-tools.ts:33` | GitHub Actions/Fly-specific descriptions/examples | `github` / `fly` contributed discovery metadata |
| `apps/website/src/contracts/core/tool-metadata/agent-plugins.ts:38` | Fly discovery example | Plugin metadata or neutral search example |
| `apps/website/src/contracts/core/tool-metadata/custom-credentials.ts:17` | Named service keywords/examples | Relevant plugin metadata |
| `apps/website/src/contracts/core/tool-metadata/deploy-ops.ts:8` | Fly/GitHub operation keywords/examples | `fly` / `github` metadata |
| `apps/website/src/contracts/core/tool-metadata/search.ts:18` | Meilisearch-specific search keywords | `meilisearch` metadata |
| `apps/website/src/contracts/core/tool-metadata/site-backup.ts:11` | GitHub-specific backup vocabulary/examples | `github` metadata |
| `apps/website/src/contracts/core/tool-metadata/skills.ts:8` | GitHub-specific install vocabulary | `github` metadata |
| `apps/website/src/contracts/core/tool-metadata/source-control.ts:8` | Closed named-source vocabulary/examples | Provider metadata |

## Credential-card follow-ups (no mechanism built)

- `cloudflare`, `github-pages`, `netlify`, `vercel`, `s3-compatible`: `tovu-deploy-targets.json` declares `credential.fields`, token help URLs and sometimes vendor labels. The `publish-host` surface is specialized already, but these descriptors do not support the full mail-style `credentialCard` block. Preserve the specialized flow and extend its generic contract in a separate job.
- `github/tovu-source-control.json`: provider-owned token fields/help exist; no full mail-style card copy contract. Keep `credential_save kind:source-control` until that contract exists.
- `fly/tovu-credential-schemes.json` only declares the `FlyV1` authorization scheme, not card copy. Operations use saved API credentials; add credential-card support through the appropriate generic operations contract later.
- `meilisearch`: module declares `credentialKeys: ['host','apiKey']`; its skill documents the exact saved label and host. Search-provider descriptors have no full card block.
- `resend` / `supabase` MCP `tovuTokenAuth`: help/probe URLs exist and tokens use `credential_save kind:agent-plugin-token`; no full plugin-declared title/intro/key-type card block. OAuth remains the first path.
- `resend` webhook signing secret: the skill uses a separately labelled generic API credential. The mail descriptor's sending-key card cannot describe a second webhook-secret credential. Add a multi-credential contribution contract separately; do not misuse a second mail adapter.
- `google-workspace`: `tovu-connections.json` declares `byoClient`, client-ID/client-secret env names, and the connection guide documents a custom OAuth client credential. Picker browser API key/app ID are operator settings. No full plugin credential-card contract exists for these setups.
- `jev`: `TYPESAFE_API_KEY` is for operator-authored code outside chat; no executable plugin connection or Tovu key-card mechanism exists. Do not fabricate either. Render/Railway generated configs likewise leave server secrets to the operator's hosting dashboard.

## Reuse and implementation handoff

Reuse: bundled mail-card enforcement; searched contribution/card tests and loaders, inspected `bundled-contribution-sources.ts`, `deploy-ops/__tests__/registry.test.ts`, `mail-provider-contribution.unit.test.ts`, `mail-adapter-registry.ts`; used the existing `bundledContributionSources` discovery helper and `parseMailAdaptersFile` validation. Missing, malformed and v1-ignored cards fail the new assertion; even a parser-defaulted credential label cannot bypass it. No new runtime policy/parser was added.

Reuse: plugin packaging/skill exposure; inspected Jini lifecycle `installed-package-index.ts`, `bundled-source-archive.ts`, `seed-bundled.ts`, `bundled-digests.ts`, and Tovu `lifecycle.ts`, `tool-registrations.ts`, `federate-mcp.ts`, `mcp-metadata.ts`, `connect-tool.ts`, `token-sign-in.ts`, credential-save handlers. Used existing pack/seed/guidance APIs and the existing `forceRemove` frozen-tree cleanup helper. No hand-maintained skill list, installed-package edit, digest rewrite, new dependency, generic runtime module or alternate credential store.

Verification is pending with the separate runner. New code is tests only; no production function ABI changed. Existing `.mjs` positional method ABIs were documented rather than rewritten. No existing code comments were removed. Coordinator is the next assignee for running checks, committing, and routing the explicitly deferred card/core-boundary work.

## Runner: exact test files

Run with the repository's existing `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks` invocation. **Not run by this worker.**

New tests:

```text
apps/website/src/features/agent-plugins/__tests__/unit/bundled-mail-credential-cards.unit.test.ts
content/agent-plugins/composio/__tests__/connection-contract.test.mjs
content/agent-plugins/higgsfield-media/__tests__/connection-contract.test.mjs
content/agent-plugins/how-tovu-works/__tests__/bundled-package.test.mjs
content/agent-plugins/jev/__tests__/bundled-package.test.mjs
content/agent-plugins/meilisearch/__tests__/provider-contract.test.mjs
content/agent-plugins/site-compliance/__tests__/bundled-package.test.mjs
content/agent-plugins/site-import/__tests__/bundled-package.test.mjs
content/agent-plugins/supabase/__tests__/connection-contract.test.mjs
content/agent-plugins/tovu-theme/__tests__/bundled-package.test.mjs
content/agent-plugins/ui-ux-design/__tests__/bundled-package.test.mjs
```

Existing affected regression tests:

```text
apps/website/src/features/agent-plugins/__tests__/unit/mail-provider-contribution.unit.test.ts
apps/website/src/features/agent-plugins/__tests__/unit/bundled-higgsfield-media-package.unit.test.ts
apps/website/src/features/agent-plugins/__tests__/unit/bundled-site-import-package.unit.test.ts
apps/website/src/features/agent-plugins/__tests__/unit/bundled-tovu-theme-package.unit.test.ts
apps/website/src/features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts
apps/website/src/features/agent-plugins/__tests__/integration/bundled-upgrade-digest-supersession.integration.test.ts
content/agent-plugins/railway/deploy-configs/__tests__/railway.test.mjs
content/agent-plugins/render/deploy-configs/__tests__/render.test.mjs
```
