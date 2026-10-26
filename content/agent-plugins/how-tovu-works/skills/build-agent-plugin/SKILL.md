---
name: build-agent-plugin
description: Build or review a Tovu agent plugin: self-contained vendor contributions, hosted MCP sign-in, plugin-owned credential cards, tests and bundled seeding. For the in-app assistant and coding agents.
---

# Build an agent plugin

Use this checklist before changing `content/agent-plugins/<id>/`. Read the existing
behavior and its owning contribution contract first; extend that owner instead of
creating a parallel implementation. The working example is `resend/`.

- [ ] Keep vendor API calls, permissions, error mapping, help text and tests inside
  this plugin. No vendor names or branches in `apps/website`, `apps/admin` or
  contracts. Generic reusable behavior belongs in `@jini-ai/*`, with injected ports.
- [ ] Make the package self-contained: runtime imports stay inside its directory
  or use the host's supported platform contract. Never import another plugin or
  reach into core source. Calling a host tool is the integration boundary.
- [ ] Write an accurate `plugin.json` description, `extensions.tovu.id`, `provides`
  and discovery keywords. Keep `skills/<id>/SKILL.md` as the default; extra skills
  use `skills/<name>/SKILL.md` with `name` and `description` frontmatter. All skill
  folders are discovered automatically; link extra skills from the default guide.
- [ ] Declare only the contributions the plugin implements. Mail uses
  `tovu-mail-adapters.json` schemaVersion **2** and a relative `.mjs` module.
  Inspect `mail-adapter-registry.ts` and Resend's adapter/default export for the
  actual ABI; inject the guarded HTTP client through `kit`, never construct a
  credentialed network client. New public functions take `(required, optional = {})`.
- [ ] Declare every user-key card in `plugin.json` under
  `extensions.tovu.credentialCards[]`. `target` is a unique card id passed to
  `credential_save {kind:"plugin-provider",target:"<card target>"}`. Supply
  `label`, `title`, `intro`, `keyHint` (required token permissions), `category`
  (`hosting`, `source-control`, `media`, `ai`, `ops`, or `general`) and an HTTPS
  `baseUrl`. Optional `helpUrl`/`helpLabel` link to the actual key-creation page;
  omit the URL when it is unknown or specific to the person's instance. Never
  invent one. Optional `fields` declare NON-secret inputs using
  `{name,label,hint?,required?}`; no values, tokens, passwords or secret fields.
  An instance-specific API can omit `baseUrl` and declare a required `baseUrl`
  field. API saves support `username` and `baseUrl` public inputs. Additional
  API origins use `additionalHosts`, a list of HTTPS origins fixed server-side.
- [ ] Choose the existing save owner with `saveKind`: `api` (default),
  `publish-host`, `source-control`, or `agent-plugin-token`. `saveTarget` names
  that owner's provider/plugin id when different from the card target. Hosting
  and source-control contributions retain their existing `credential.fields`,
  `tokenField`, validation, verification and stores; mirror their public fields
  in the card declaration. The card changes copy, never grants permissions or
  replaces the domain's save lifecycle. Mail's existing v2 descriptor
  `credentialCard` is still supported unchanged and merged into the same loader;
  do not redeclare the same target in the manifest.
- [ ] Hosted sign-in uses a declaration with `saveKind:"oauth"`, a title, intro
  and `permissions` describing what connects and what access is requested.
  Invoke it through `agent_plugin_connect {pluginId}`. Declare a separate
  `agent-plugin-token` card only when `mcp.json` already supports `tovuTokenAuth`.
  An OAuth-only service must never be given an invented API-key fallback.
  The generic **Save an API credential** card is only a fallback when no plugin
  declares a suitable card.
- [ ] For hosted MCP, put transport/URL and `tovuTokenAuth` help/probe URLs in
  `mcp.json`; put OAuth and tool grants in
  `plugin.json`'s `extensions.tovu.mcpServers[serverId]`. Resend and Supabase show
  OAuth plus token fallback. Start with `agent_plugin_connect {pluginId}`. Only
  when needed, open the plugin’s declared token card with
  `credential_save {kind:"plugin-provider",target:"<token card target>"}`.
  The human enters the key in the secure form; the host probes and seals it, then
  supplies bearer auth to that connection server-side. The assistant never sees
  the key. The site's mail sending key is separate from the MCP account key.
  Never inline secrets in headers, URLs, env values, examples or tool arguments.
  Declare read/write grants explicitly; remote annotations alone cannot grant trust.
- [ ] Ship tests in the plugin's `__tests__/` (or beside its modules). Exercise the
  declared module with injected fake HTTP/clock ports, credential handling,
  provider failures and package contents; no live keys. Skill-only plugins test
  their packaged references and important output/safety contracts.
- [ ] **Tools first:** the in-app assistant discovers schemas with `search_tools`
  / `describe_tool` and uses `fs_*`, plugin guidance, `credential_save`, connect and
  contribution tools. Never use Bash, curl or a vendor CLI to bypass those tools.
  If authoring tools are unavailable, explain the missing capability and hand the
  files to a coding agent. Coding agents can edit/test the checkout as authorized.
- [ ] Verify packing and seeding, not just source text. Jini owns the lifecycle;
  Tovu binds it in `apps/website/src/features/agent-plugins/lifecycle.ts`. Bundled
  source is packed and hashed on boot; `bundled-digests.json` selects the current
  installed bytes even for content-only changes. Never edit installed digest
  directories or hand-write that ledger. Respect saved activation decisions;
  new seed-enabled policy is a coordinator decision, not vendor logic in core.

## Generic example from the bundled Cloudflare plugin

This is its Pages card (the plugin also declares a Workers card). The existing
hosting descriptor owns the masked token, required Account ID and optional Zone
ID; the same generic renderer applies this card's copy and key hint to that form.

```json
{
  "extensions": {
    "tovu": {
      "credentialCards": [
        {
          "target": "cloudflare-pages",
          "title": "Connect Cloudflare Pages",
          "label": "Cloudflare Pages connection",
          "category": "hosting",
          "intro": "Connect Cloudflare Pages to publish this site, with optional approved custom-domain changes.",
          "keyHint": "Scope to the selected account: Account → Cloudflare Pages → Edit. Custom domains need Zone, DNS, Workers Routes and Workers Scripts reads; attaching a domain needs DNS → Edit. Grant Workers Scripts or Workers Routes edit only for corresponding approved transfers.",
          "saveKind": "publish-host",
          "fields": [
            {
              "name": "accountId",
              "label": "Account ID",
              "hint": "Cloudflare dashboard: the long ID in the address bar, right after dash.cloudflare.com/.",
              "required": true
            },
            {
              "name": "zoneId",
              "label": "Default Zone ID",
              "hint": "Optional default zone; per-publish Zone ID takes precedence.",
              "required": false
            }
          ],
          "helpUrl": "https://dash.cloudflare.com/profile/api-tokens",
          "helpLabel": "Create a token",
          "baseUrl": "https://api.cloudflare.com"
        }
      ]
    }
  }
}
```

Open it with `credential_save {kind:"plugin-provider",target:"cloudflare-pages"}`.
For the full, current permissions copy, read `cloudflare/plugin.json` and its
`skills/cloudflare/references/permissions.md`. New declarations are checked by
`bundled-mail-credential-cards.unit.test.ts` across contribution types, despite
that test's historical filename.

## Minimal example from Resend

```text
resend/
  plugin.json
  mcp.json
  skills/resend/SKILL.md
  tovu-mail-adapters.json
  adapters/resend.mjs
  lib/domains.mjs
  lib/feedback.mjs
  __tests__/bundled-mail.test.mjs
  __tests__/resend.test.mjs
  __tests__/resend-mcp.test.mjs
```

`plugin.json` excerpt (the real plugin also declares its tool grants):

```json
{"extensions":{"tovu":{"id":"tovu/resend","provides":["outbound-mail"],
  "mcpServers":{"resend":{"tovuAuthMode":"oauth"}}}}}
```

`mcp.json` transport entry:

```json
{"mcpServers":{"resend":{
  "type":"streamable-http","url":"https://mcp.resend.com/mcp",
  "tovuTokenAuth":{"helpUrl":"https://resend.com/api-keys",
                   "probeUrl":"https://api.resend.com/domains"}
}}}
```

`tovu-mail-adapters.json`:

```json
{"schemaVersion":2,"adapters":[{
  "id":"resend","label":"Resend","module":"adapters/resend.mjs",
  "credentialLabel":"Tovu Mail — Resend API","credentialKeys":["token"],
  "feedback":true,
  "credentialCard":{
    "title":"Connect Resend",
    "intro":"Connect Resend so this site can send its email (sign-in links, confirmations, form notifications).",
    "helpUrl":"https://resend.com/api-keys",
    "helpLabel":"Get a key at resend.com/api-keys",
    "keyHint":"Create a key with Sending access",
    "baseUrl":"https://api.resend.com"
  }
}]}
```

`adapters/resend.mjs` export excerpt; the implementations and helper imports live
in that same package (read the file for the legacy mailer method ABI):

```js
export default {
  id: 'resend',
  label: 'Resend',
  credentialKeys: ['token'],
  webhookSecretKey: 'webhookSecret',
  capabilities: { hosted: true, feedback: true, domainVerification: true, rateLimit: { perSecond: 2, burst: 2 } },
  create,
  feedback,
  domainRequirements,
  domainStatus,
};
```

Do not hard-code a vendor picker, token label, API origin or error branch in core.
Do not import a sibling plugin's implementation. Use the contribution loader's
trusted, active bundled-package gate; a third-party upload does not authorize code execution.

- Card saves go to the project unattached. Follow the result's `ask` exactly; on yes call `project_key_use {keyId, use:true}`. An existing site key stays site-only.
