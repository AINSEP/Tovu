Skills loaded: software-architect/skills.md v2.3.1.
ACK_PACKET_RECEIVED CTX-providers-gaps-2026-10-21 -- I received the packet and will work on it.

**0. Wrong in all three designs (v1, S):** they name tools with dots (`mail.send_test`, `dns.apply`, `search.query`). The plugin tool grammar is `^[a-z][a-z0-9_]{0,63}$` (`jini-int packages/agent-plugins/src/lifecycle/tools/manifest.ts:29`), and LLM tool-name rules reject dots too. Use `mail_send_test` and so on.

**1. Email**
- **Fresh install sends nothing (v1, S).** Today the fallback is Console (`resolve-mailer.ts:255`). "Default smtp" without credentials keeps that state, so magic links quietly go to stdout. The design needs an explicit `unconfigured` status, a blocking admin banner, and owner sign-in that never depends on email.
- **No SPF/DKIM/DMARC at all (v1, M).** Add `domainRequirements({domain}) → DomainRequirement[]` and `domainStatus` to the provider. `SenderIdentityPort` must refuse a From domain the active hosted provider hasn't verified.
- **Complaint → global suppression is wrong (v1, S).** It would lock a member out of magic-link login permanently. Complaints should suppress bulk mail only; hard bounces suppress everything.
- **The dedup ledger isn't atomic (v1, S).** Calling `wasSent` then `markSent` around an SMTP send either double-sends or loses mail after a crash. Use reserve, then send, with an `unknown` state. Each purpose picks its policy: login links are never resent automatically (the user just asks again); confirmations are.
- **Rate limits are missing (v1, S).** Add `capabilities.rateLimit` and a token bucket in the policy mailer, with 429 → retryable. Newsletter delivery must respect it.
- **List-Unsubscribe-Post (v1, S)** needs a no-auth, signed-token, one-click endpoint. Name it, or reuse the newsletter one.
- **Templates (v1, S):** strip CR/LF from variables that go into the subject. Pick the locale as recipient preference, then site default.
- **Webhook route (v1, S):** cap body size, rate-limit unverified requests, and keep secrets in the vault.
- **Separate transactional/bulk providers: later (M).** Shape the setting as `mail.provider.{transactional,bulk}` now so it needs no migration.
- **Failover: out.** Different providers mean different domain verifications.
- **Postmark: later.** Resend already proves the contract can be swapped.

**2. DNS**
- **SPF merge (v1, S).** The planner "preserves TXT", but mail verification has to create or merge TXT records, and two `v=spf1` records cause a permerror. Merge SPF includes; never add a second one.
- **Delegation check (v1, S).** `findZone` can succeed in a Cloudflare account while the registrar's NS points elsewhere. Check NS delegation before planning. That check is the registrar/DNS-host split; registrar writes are **out**.
- **Verify against the authoritative nameservers (v1, S),** not DoH. A caching resolver gives stale answers until the old TTL expires.
- **CAA and CNAME exclusivity (v1, S).** Fail the plan if an existing CAA record excludes the target's certificate authority. A CNAME can't share its name with other records.
- **Atomic batches (later, S).** Single-change `apply` gives up Route53's atomic `ChangeResourceRecordSets`. Add an optional `applyBatch`.
- **Rollback (later, S):** the journal already holds before/after, so a `dns_rollback` tool is cheap.
- **Drift (later, M):** Route53 has no comment marker, so ownership has to come from the journal.
- **Manual provider (v1, S):** `apply → CONFLICT` misuses an error code. Drive it from `capabilities.automatic` instead.
- **ACME DNS-01 / temporary records: out.** Deploy targets own their certificates.

**3. Search**
- **Scheduled-post bug (v1, S).** `classifyStatusTransition` ignores `publishAt` (`post.ts:2090-2100`), so a scheduled post fires `entry.published` at save time. If the source indexes it, embargoed content leaks. If `load()` returns null because `isLiveAt` is false, nothing ever re-triggers at go-live. This needs a go-live sweep in S2.
- **Member content must not reach vendors (v1, S).** Send only public documents to external providers, and gate audience-tagged documents behind an `inProcess` capability. Snippets leak body text, and Algolia search keys sit in the browser. The design's open question 1 should be answered "public-only" for vendors.
- **Snippets as HTML are an XSS risk (v1, S).** Make them plain text plus highlight ranges.
- **Facets are declared but never returned (v1, S).** The query result has no facet counts.
- **`version` sorts wrongly as a string (v1, S)** ("10" < "9"). Make it a number.
- **No fallback when a vendor is down (v1, M).** Keep the built-in index as an always-on shadow, with a timeout budget and fallback to it. That also makes blue/green provider switches trivial.
- **Example vendors must be Agent Plugins (v1, S),** not `Jini/packages/search-*`. Otherwise they skip the trust gate.
- **Index names (v1, S):** use the install id, not the site slug, to avoid collisions across installs.
- **Conformance kit additions:** audience isolation, removing an id that was never indexed, and returning results whose IDs match documents actually indexed. Ship Meilisearch in v1; Algolia later.

**4. Cross-cutting**
- **Registry first: yes, but small (S).** It should hold the id grammar, the duplicate-id throw, get/list, the contribution wrapper, and shared `ProviderResult<T>` / `ProviderContext` / `DomainRequirement` types. Each design currently redefines all of these. `DomainRequirement` is used by email, DNS and deploy, so it can't live in `devops/dns`: platform shouldn't import devops, and plugins never import each other. Move the four existing registry shapes onto it **after** the contracts land, not before.
- **Unsafe to build in parallel:**
  - Every lot adds an ADR-066 migration numbered `00NN`. Pre-assign the numbers.
  - All three edit `composition/app.ts`, which is already dirty in the git status, plus the tool registry and the loader.
  - S2 edits `post.ts`.
  - Run them one after another, or give one lane ownership of composition and migrations.
- **Order:** Email (live bugs) → Search S1–S5 → DNS D1–D3 plus the mail requirements.
- **Don't build now:** DNS D4–D7 (generic apply, Cloudflare extraction, Route53). The Cloudflare path works. Don't let the old path diverge: when D5 runs, it has to absorb it.

**5. Summary**

| Item | Status | Size |
|---|---|---|
| E-unconfigured state, domain verification, suppression scope, reserve-send, rate limits, unsubscribe endpoint, templates, webhook hardening | v1 | S/M |
| Per-lane email providers | later | M |
| Postmark | later | S |
| Email failover | out | — |
| SPF merge, delegation check, authoritative verify, CAA/CNAME checks, manual provider capability | v1 | S |
| DNS applyBatch, rollback, drift | later | S/M |
| DNS D4–D7 | later | L |
| DNS-01 certs, registrar writes | out | — |
| Search: go-live sweep, public-only vendors, plain-text snippets, facets, numeric version, plugin packaging, index names | v1 | S |
| Search shadow fallback | v1 | M |
| Algolia | later | S |
| Registry plus shared types | v1 | S |
| Tool-name fix | v1 | S |

<<SWARM_END>>