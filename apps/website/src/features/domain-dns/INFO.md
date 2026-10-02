# Domain/DNS diagnostics

`tools.ts` owns the `domain-dns` contributor, catalog, risk declarations, public DNS port, hostname validation, and host comparison. Three tools: `domain_lookup_dns`, `domain_check_dns`, and `domain_tls_status`.

All are read-only. DNS/TLS require `content.read`; comparison requires both `deployments.read` and `publish_content.read`. Authorization precedes injected repository and network effects.

The composition root injects a public DNS resolver, TLS probe, and workspace-scoped saved-host reader. Production adapters live in `server/runtime/composition/domain-dns-adapters.ts`; they reuse `platform/http` for SSRF classification and peer pinning. DNS uses public DoH, avoiding local/internal resolver disclosure. TLS uses a single HTTPS HEAD without redirects. Certificate issuer/expiry metadata are unavailable with the current HTTP port.

DNS lookup accepts underscore owner names used by ACME, DKIM, and DMARC. TLS, host comparison, and saved hosting URLs require ordinary public hostnames. Every DNS lookup reflects one public resolver's current view; it does not prove propagation to all resolvers.

Comparison uses current public host DNS because publish history does not persist provider-required DNS records. A match is DNS evidence; it does not prove correct routing on shared IPs/CDNs. No independent saved host yields unknown. Answers are untrusted data.

Tests: `__tests__/tools.test.ts`, composition's `__tests__/domain-dns-adapters.test.ts` and `__tests__/domain-tls-transport.test.ts`, and assistant's `__tests__/domain-dns-search-discoverability.test.ts`. All use fake network dependencies; no port binding is needed.
