# Domains & DNS — contract + provider plugins (design, report-only)

Today (evidence AUDIT.md §domain-dns): read-only diagnostics only — Jini `diagnostics/src/domain-dns/index.ts:9-31`
(`PublicDnsResolver`, `TlsStatus`) with one inline Cloudflare-DoH adapter (`Tovu server/runtime/composition/
domain-dns-adapters.ts:63,68`) and three `sideEffects:"none"` tools (`features/domain-dns/tools.ts:41-68`).
DNS **writes** exist only inside the Cloudflare deploy-target plugin (`content/agent-plugins/cloudflare/lib/
dns.mjs:26` `planDns`, `domains.mjs:49-58` `assertDomainApproval` with a fingerprinted, re-previewed, server-held
approval) and are reached only through `deployment_execute_static_publish{customDomain, zoneId}`
(`features/deployments/publish-agent-tools.ts:220,1041`). So a site hosted on Netlify with DNS at Route53 has no
path, and the good approval protocol is locked inside one vendor plugin.

## 1. File tree
```
Jini/packages/diagnostics/src/domain-dns/   keep: PublicDnsResolver (single default, config-swappable), TlsStatus
Jini/packages/devops/src/dns/               new generic kernel (devops already owns deploy + source-control contracts)
  contract.ts      DnsProvider, DnsChangePlan, DnsRecord, DomainRequirement
  plan.ts          diffRecords() pure planner + fingerprint() (sha-256 over canonical plan)
  approval.ts      createDnsChangeApproval() — lifts Cloudflare's assertDomainApproval protocol into core
  registry.ts      createDnsProviderRegistry() (commerce payments/registry.ts shape)
  verify.ts        createPropagationChecker() over PublicDnsResolver
  contribution.ts  defineDnsProviderContribution({filename}) → defineExecutablePluginContribution
  manual.ts        the DEFAULT provider "manual" (no API: emits instructions)
  tools.ts         dns.* agent tools
  testkit/         runDnsProviderConformance() + fake zone
Tovu/content/agent-plugins/cloudflare/   adds tovu-dns-providers.json exporting the extracted lib/{dns,zones}.mjs
Tovu/content/agent-plugins/route53/      new example plugin (SigV4 signing done in-module over kit.httpClient)
Tovu/apps/website/src/features/domain-dns/   product: domain setting, requirements from deploy target, UI card
Tovu/apps/website/src/platform/db/migrations/00NN_domain_bindings.ts   ADR-066: domain_binding, dns_change_journal
```

## 2. Contract
```ts
export type DnsProviderId = string;                         // open, ADR-026 grammar
export type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "CAA" | "ALIAS";
export interface DnsRecord { readonly name: string; readonly type: DnsRecordType; readonly value: string;
  readonly ttl: number; readonly providerRef?: string; readonly managedBy?: "tovu" | "other" }
/** What a deploy target needs for a hostname — produced by the target plugin, not by DNS providers. */
export interface DomainRequirement { readonly hostname: string; readonly records: readonly Omit<DnsRecord, "providerRef">[];
  readonly purpose: "routing" | "verification" | "certificate" | "mail"; readonly removable: boolean }
export interface DnsChange { readonly op: "create" | "update" | "delete"; readonly before?: DnsRecord; readonly after?: DnsRecord; readonly reason: string }
export interface DnsChangePlan { readonly providerId: DnsProviderId; readonly zone: string; readonly changes: readonly DnsChange[];
  readonly preserved: readonly DnsRecord[];                 // disclosed, untouched (wildcards, mail, CAA)
  readonly inventory: "complete" | "partial"; readonly fingerprint: string }
export type DnsResult<T> = { ok: true; value: T } | { ok: false; code: DnsErrorCode; message: string; retryable: boolean };
export type DnsErrorCode = "NOT_CONFIGURED" | "ZONE_NOT_FOUND" | "PERMISSION" | "CONFLICT" | "TRANSPORT_ERROR" | "PROVIDER_ERROR";
export interface DnsProviderContext { readonly credentials: Readonly<Record<string, string>>; readonly httpClient: HttpClientPort; readonly now: () => number }
export interface DnsProvider {
  readonly id: DnsProviderId; readonly label: string; readonly credentialKeys: readonly string[];
  readonly capabilities: { readonly automatic: boolean; readonly recordTypes: readonly DnsRecordType[]; readonly apexFlattening: boolean };
  findZone(ctx: DnsProviderContext, required: { hostname: string }): Promise<DnsResult<{ zone: string; ref: string } | null>>;
  listRecords(ctx: DnsProviderContext, required: { zoneRef: string; names: readonly string[] }): Promise<DnsResult<{ records: readonly DnsRecord[]; complete: boolean }>>;
  apply(ctx: DnsProviderContext, required: { zoneRef: string; change: DnsChange; idempotencyKey: string }): Promise<DnsResult<{ record?: DnsRecord }>>;
  /** Manual provider: human-readable steps instead of apply(). */
  instructions?(required: { plan: DnsChangePlan }): readonly string[];
}
```
Planning is **core**, not per provider: `diffRecords({ current, requirements })` produces the plan (only
conflicting address records change; wildcard/mail/TXT/CAA preserved and disclosed — the rule in
`cloudflare/lib/dns.mjs:22-23`), so every provider gets identical, testable semantics. Providers only list/apply.

## 3. Default provider: `manual`
`capabilities.automatic=false`; `findZone` returns the registrable domain (public-suffix aware), `listRecords`
reads through `PublicDnsResolver`, `apply` → `CONFLICT` ("manual"), `instructions()` renders a copy-paste table
(type/name/value/TTL, apex note when `ALIAS`/flattening is required). Works for every registrar, out of the box.

## 4. Example vendors
- **Cloudflare** (extract from the existing plugin): `GET/POST/PATCH/DELETE /zones/:id/dns_records`,
  `comment` marker → `managedBy:"tovu"`; deploy-target plugin keeps Workers/Pages *bindings* and now asks the DNS
  port for records instead of calling `planDns` itself.
- **Route53**: `ListHostedZonesByName`, `ListResourceRecordSets`, `ChangeResourceRecordSets` (UPSERT/DELETE,
  change id → `GetChange` for INSYNC); ALIAS for apex to CloudFront/S3.

## 5. Verification + propagation
After apply (or after the human says "done" for `manual`): `createPropagationChecker` polls `PublicDnsResolver`
(Cloudflare DoH today; optionally a second resolver) for each requirement; states `pending → propagated |
mismatch | timeout`, backoff 30s→10min, cap 48h, then `domain_tls_status` (`tools.ts`) for the certificate.
Results go to `domain_binding.status` (single writer: the checker job). A transport error is `unknown`, retried,
never "failed". Persisting requirements at publish time fixes the INFO.md gap that `domain_check_dns` can only
compare host IPs.

## 6. DI / composition + plugin registration
Tokens (Jini devops): `DnsProviderRegistryToken`, `DnsServiceToken`. Tovu `composition/modules/domain-dns.ts`:
registry = `[manual]` + plugins from `defineDnsProviderContribution({ filename: "tovu-dns-providers.json" })`
(descriptor `{ id, module, credentialKeys }`; validate default export is a `DnsProvider` with that id); per
domain, `domain_binding.provider_id` (default `manual`; suggest a provider when `findZone` succeeds with saved
credentials). Deploy targets expose `requirements({ hostname }) → DomainRequirement[]` as a declared capability,
replacing the magic `customDomain`/`zoneId` field names (`publish-agent-tools.ts:220,1041`). Trust: lifecycle
only (bundled digests today); manifest grants nothing.

## 7. Agent tools + approval
| tool | effect | gate |
|---|---|---|
| `domain_lookup_dns` / `domain_check_dns` / `domain_tls_status` | read (exist) | none |
| `dns.plan` | read: requirements + current → plan + fingerprint | none |
| `dns.apply` | writes records | `createDnsChangeApproval`: re-plan, refuse `inventory:"partial"`, refuse stale fingerprint, server-held `authorize({fingerprint, zone})` via `createApprovalHandler` (core/src/approval.ts:55); model flags never approve; never rememberable for deletes |
| `dns.instructions` | manual steps | none |
| `dns.verify` | start/inspect propagation | none |
| `domain.set_provider` | settings | approval |
Apply is sequential with a `dns_change_journal` row per change (idempotency key = fingerprint+index), so a partial
failure resumes from a fresh plan and names unfinished records (Cloudflare's current behaviour, made generic).

## 8. Migration of existing code
1. Move `planDns` semantics into `devops/src/dns/plan.ts` with the plugin's tests as characterization.
2. Cloudflare plugin: new `tovu-dns-providers.json`; `domains.mjs` calls the core approval instead of its own.
3. `deployment_execute_static_publish{customDomain}` becomes: publish → `dns.plan` → approval card → `dns.apply`.
4. Diagnostics tools unchanged; resolver adapter moves behind a token (still one default).

## 9. Lots
D1 contract + planner + fingerprint + testkit (fake zone) · D2 manual provider + instructions + `dns.plan`/
`dns.instructions` · D3 migration + propagation checker + `dns.verify` · D4 core approval + `dns.apply` + journal ·
D5 Cloudflare extraction (characterization tests first) · D6 deploy-target `requirements()` capability, drop magic
fields · D7 Route53 plugin.

## 10. Risks
Deleting a live record (preserve-by-default, delete only conflicting address records, never mail/TXT/CAA) ·
apex CNAME on non-flattening hosts (planner refuses, suggests ALIAS/A) · partial inventory → zero mutations ·
long propagation reported as error (states + 48h cap) · credentials with zone-wide write scope (doc least privilege).

## 11. Owner questions
1. May agents delete records at all, or only create/update with deletes left to the human?
2. Should Tovu ever buy/transfer domains (registrar contract), or stay DNS-only?
3. Is Cloudflare the recommended paid default, with `manual` as the out-of-box default, as proposed?
