ACK_PACKET_RECEIVED CTX-providers-gaps-2026-10-21 -- I received the packet and will work on it.

`skills.md` loaded. I read the four design files and spot-checked `trusted-plugin-files.ts:24-26`, `ports.ts:46-49` and `post.ts`. I did not trace most other cites.

**Verdict:** the three designs are sound in shape. The weak spot is that none of them says who owns domain and sender identity, and the shared DNS/email boundary is left implicit.

## 1. Email
- **Sender and domain verification is the biggest hole (v1, M).** `SenderIdentityPort` replaces the `*.local` literals, but nothing checks that the sender domain is verified at the provider. `MailProviderModule` has no `verifyDomain()` or `requiredDnsRecords()` method. Add `DomainRequirement{purpose:"mail"}` (SPF, DKIM, DMARC) on the DNS side, and have `mail.status` report "sender unverified". Without this, real providers reject sends silently.
- **Default provider (v1, S).** SMTP as default is wrong on a fresh install. There is no mailbox, so the default is effectively Console, which `launch-gate.ts` already refuses for newsletters. Say plainly that fresh install means "mail not configured", and have `mail.status` return it as a state. Don't call it a working default.
- **Lanes (v1, S).** The policy mailer should treat `purpose` as a hard lane. Transactional mail (magic link) must bypass the suppression list's bulk rules and its rate limits. It must not be blocked by a bulk-complaint suppression. Say that explicitly.
- **Rate limits and failover (later, M).** The design has neither. A per-provider token bucket belongs in the policy mailer. Failover between providers is out, because it adds an idempotency and dedup problem across vendors.
- **Test mode (v1, S).** A site-level "redirect all mail to the operator" setting is missing.
- **Secrets (v1, S).** The webhook secret is a new credential per provider. The design names it only under Risks, but it needs its own `credentialKeys` entry and a rotation story.
- **E2 safety (v1, S).** The risk note is right: write the current effective provider into the setting on first boot, as part of the migration.
- **Templates, i18n and theme overrides (later, M).** Built-ins only in v1. `manyToken` last-wins override is order-dependent and non-deterministic, so keep it out for now.
- **DSN/VERP (out).**

## 2. DNS
- **Registrar vs DNS host split (v1, S).** The design only covers DNS hosting. State that registrar and NS delegation are out. Add an NS-delegation check, because `findZone` can succeed at Route53 while the registrar still points at other nameservers, and propagation then times out. Verification must query the delegated nameservers, not just DoH.
- **Single-resolver propagation (v1, S).** `createPropagationChecker` uses one DoH resolver. A single resolver is a false-positive source. Require two resolvers, or the authoritative NS.
- **Drift detection (later, M).** There is none. The journal records changes but nothing re-plans on a schedule. A "managedBy tovu" record changed by a human is not noticed.
- **Rollback (v1, S).** The journal stores `before`, but there is no `dns.rollback`. Add it as the inverse of a journal range. It needs approval, and records not created by Tovu are excluded.
- **TLS coupling (v1, M).** Certificates are a `purpose` in `DomainRequirement`, but who triggers issuance, and when, is undefined. On Cloudflare, proxy mode changes the records (CNAME to Pages versus A). A requirement for a CAA conflict is also missing. State that the deploy target owns issuance and DNS only produces records.
- **Delete policy (v1, S).** Owner question 1 should default to deletes by humans only. `dns.apply` approval is also "never rememberable for deletes", but creates are rememberable, and that includes apex A changes that can take a site down. Make anything touching apex or MX non-rememberable.
- **Rate limits (later, S).** Cloudflare and Route53 limits are not handled. `apply` is sequential with retryable errors, so this is mostly fine.
- **Registrar and domain purchase (out).**

## 3. Search
- **Stale claim.** The design says trash emits no entry event. It does: `post.ts:712` documents that trash emits `entry.unpublished` for a published row, and `post.ts:681` explicitly declines to invent `entry.deleted`. Lot S2's new event is unnecessary and goes against the existing code decision. Drop it. A hard delete of an already-trashed row emits nothing, but the row was already removed at trash time, so this is fine.
- **Permission leak (v1, M, blocking).** The design relies on `source.load` returning null for non-public and on `audiences` injected by the host. Two holes remain. First, `visibility` is set at index time, so a visibility change on an existing entry (public to members-only) needs an event path, and an `entry.updated` with a mismatched `version` must remove the doc from the vendor, not just update it. Second, vendor secured keys such as Algolia's are query-time only, and a leaked search key exposes the whole index. Recommendation: v1 is public-only for vendors, and the built-in is the only provider allowed to hold audience-filtered content. Enforce it with a capability flag `acceptsRestricted`.
- **Drafts (v1, S).** Indexing happens only on `entry.published`, which is good. Unpublish must delete, and the conformance kit needs a "published to draft removes" case.
- **Conformance kit (v1, M).** Add a leak case ("restricted doc never returned without audience") and a version-ordering case. Both are already listed, so it is mostly fine. Add `indexName` isolation between sites.
- **Multi-site (v1, S).** `workspaceId` is in the context and `indexName` is `<site>-<ws>`, but the registry and `search.provider` setting scope is undefined. Make the setting per-site.
- **Latency fallback (later, M).** There is none. A vendor outage means the search block fails. Add a timeout and an `ok:false` UI state. Fallback to the built-in during an outage needs the built-in index kept warm, which is a cost, so leave it out of v1.
- **Contract for the owner's built-in (v1, S).** `ensureIndex`, `clear` and `versionOf` are fine. Snippet and ranking are provider-private and untestable. The kit should assert only that snippets are non-empty and contain no restricted content. Facets are capability-gated and should be dropped from v1.

## 4. Cross-cutting
- **Registry helper first: yes, right call.** It must expose a version or contract-shape check, so that three consumers cannot diverge.
- **Parallel build safety.** Email and DNS both own the `DomainRequirement` and DNS-record semantics for mail, so build DNS D1 (contract) before email E3. Both add Tovu migrations with the same `00NN` number: assign numbers up front. All three touch `composition/` and `app.ts`, which is being modified now, so serialize the Tovu wiring lots.
- **Do not build now:** DNS D7 (Route53) and the DNS migration D6 (deploy-target `requirements()` and dropping the magic fields). They depend on the open trust-gate decision, and Cloudflare is the only real consumer. Build email, then search, with DNS D1-D4 in between.

<<SWARM_END>>