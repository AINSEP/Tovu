# Domain/DNS diagnostics

`tools.ts` owns the `domain-dns` contributor, catalog, risk declarations, public DNS port, hostname validation, and host comparison. Three tools: `domain_lookup_dns`, `domain_check_dns`, and `domain_tls_status`.

All are read-only. DNS/TLS require `content.read`; comparison requires both `deployments.read` and `publish_content.read`. Authorization precedes injected repository and network effects.

The composition root injects a public DNS resolver, TLS probe, and workspace-scoped saved-host reader. Production adapters live in `server/runtime/composition/domain-dns-adapters.ts`; they reuse `platform/http` for SSRF classification and peer pinning. DNS uses public DoH, avoiding local/internal resolver disclosure. TLS uses a single HTTPS HEAD without redirects. Certificate issuer/expiry metadata are unavailable with the current HTTP port.

DNS lookup accepts underscore owner names used by ACME, DKIM, and DMARC. TLS, host comparison, and saved hosting URLs require ordinary public hostnames. Every DNS lookup reflects one public resolver's current view; it does not prove propagation to all resolvers.

Comparison uses current public host DNS because publish history does not persist provider-required DNS records. A match is DNS evidence; it does not prove correct routing on shared IPs/CDNs. No independent saved host yields unknown. Answers are untrusted data.

Tests: `__tests__/tools.test.ts`, composition's `__tests__/domain-dns-adapters.test.ts` and `__tests__/domain-tls-transport.test.ts`, and assistant's `__tests__/domain-dns-search-discoverability.test.ts`. All use fake network dependencies; no port binding is needed.

## DNS change tools (domains & DNS lots D1–D3)

`dns-tools.ts` adds `dns_plan`, `dns_instructions` (read-only, `deployments.read`) and `dns_verify` (`mutates-durable-state`, `deployments.publish`, edit/direct) to the same `domain-dns` contributor; `contributeDomainDnsAndChangeTools` builds both sets. The three diagnostics above are unchanged.

`dns-changes.ts` orders the Jini kernel (`@jini-ai/devops/dns`): requirements (caller or saved binding) → provider (`domain_binding.provider_id`, default `manual`) → zone → NS delegation → current records from the zone's own nameservers → `planDnsChanges`. Nothing writes DNS in v1 (no apply engine): a person enters the `dns_instructions` rows, then `dns_verify` checks every authoritative nameserver once, persists the requirements and status in `domain_binding` (migration 0024, `binding.repo.ts`) and schedules the next check (30 s doubling to 10 min; `timeout` after 48 h; `unknown` = transport failure, retried). The verify path is the only writer of `domain_binding.status`. `verifyDueDomainBindings` is the sweep body; `createServingApp` runs it every minute (`server/runtime/composition/domain-binding-sweeper.ts`, single flight, unref'd, stopped at shutdown) through the pre-bound `RouteDeps.verifyDueDomainBindings` that only `server/deps.ts` sets.

`include: ["mail"]` (all three tools, `mail-requirements.ts`): the active transactional mail provider's records for the configured sender domain come through the `mailRequirements` port (`RouteDeps.mailDomainRequirements` = the resolved mailer's `domainRequirements`) and replace any earlier copy in the requirements, so `dns_verify` persists them in the binding. The planner merges SPF. DMARC is never doubled or overwritten: an existing `_dmarc` DMARC record is kept (a provider-supplied one is dropped); with none, a `v=DMARC1; p=none` hint is added; when existence cannot be read, nothing is added.

Composition: `server/runtime/composition/authoritative-dns.ts` (node:dns `Resolver` + `setServers` against the nameserver's public address, per-query timeout, errors → `unknown`) and `dns-change-deps.ts` (one resolver + `createDnsProviderRegistry` per process; binding store only where `contentKernel` exists, so hermetic roots refuse `dns_verify`).

Tests: `__tests__/dns-changes.test.ts`, `__tests__/dns-tools.test.ts`, `__tests__/mail-requirements.test.ts`, `__tests__/binding.repo.dialects.test.ts` (SQLite + PGlite), composition's `__tests__/authoritative-dns.test.ts` `__tests__/dns-change-deps.test.ts` and `__tests__/domain-binding-sweeper.test.ts`, and `platform/db/migrations/__tests__/domain-bindings-step.test.ts`. All use DI fakes; no network.
