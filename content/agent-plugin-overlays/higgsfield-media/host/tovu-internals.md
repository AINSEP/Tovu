# Tovu internals behind the higgsfield-media guidance

For diagnosis and for maintainers. Each line names where a behavior in the guidance lives.

- **OAuth self-configuration.** `assistant/external-mcp-oauth.ts` ("Self-configuration: discovery
  + dynamic client registration") discovers Higgsfield's endpoints and mints Tovu's own OAuth
  client on the first connect.
- **The write grant.** `mcp-federation/trust.ts`, rule R3: a remote tool whose own annotations
  declare `readOnlyHint: false` is refused, even when allowlisted, unless it is also named in
  `writeAllowedToolNames`.
- **Bundled and disabled.** `seed-bundled.ts` writes `{ enabled: false, origin: "bundled" }` on
  first boot; `recordBundledAgentPluginIfAbsent` never overwrites an existing decision.
- **Tool registration.** Per-plugin tools are registered once, in `agent-daemon-server.ts`'s boot
  sequence.
- **The 15-second ceiling (note for maintainers, not for the agent).** The ceiling is
  `connectTimeoutMs` (15 s) being applied as the per-request bound on the hosted transport, while
  the configured `callTimeoutMs` (30 s) is only applied on the stdio transport. If that is ever
  corrected, `sync: true` would fit inside a 30 s ceiling and that failure mode would disappear.
  Until then, polling is the only supported path.
- **`TOVU_PUBLIC_URL`** was unset in the development environment as of 2026-09-09; the refusal is
  a fact about the deployment, not about Higgsfield.
