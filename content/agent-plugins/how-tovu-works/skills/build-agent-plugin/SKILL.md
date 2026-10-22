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
- [ ] Declare the plugin's **own credential card for every user key where the
  contribution supports cards**. Mail adapters with `credentialLabel` must have
  `credentialCard`: title, intro, help URL/label, key-type hint and HTTPS base URL.
  Core prefills the saved label and category. Open it with
  `credential_save {kind:"plugin-provider",target:"resend"}` (substitute adapter id).
  The generic **Save an API credential** card is a fallback only. Never give a mail
  key a generic card offering “Works for” deploy hosts. For contributions without
  a card mechanism, report the gap; do not invent an ignored descriptor field.
- [ ] For hosted MCP, put transport/URL and `tovuTokenAuth` help/probe URLs in
  `mcp.json`; put OAuth and tool grants in
  `plugin.json`'s `extensions.tovu.mcpServers[serverId]`. Resend and Supabase show
  OAuth plus token fallback. Start with `agent_plugin_connect {pluginId}`. Only
  when needed, use `credential_save {kind:"agent-plugin-token",target:pluginId}`.
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
