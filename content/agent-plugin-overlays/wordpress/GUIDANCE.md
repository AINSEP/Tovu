# Tovu host guidance for wordpress

These rules specialize the portable plugin guidance for Tovu.


## Host operations for skills/wordpress/SKILL.md

Load the selected host's skill. Use `deployment_get_static_publish_capabilities`,
its existing connection card if needed, `deployment_preview_static_publish`, and
`deployment_execute_static_publish` with the existing publish confirmation flow.
Keep partial or protected outcomes visible. Record the deployment under that host;
never describe it as a WordPress deployment.


## Host operations for skills/wordpress/references/free-site-redirect.md

1. Load the existing host's skill and complete its preview and confirmed publish
   flow. Use the real public URL; verify trusted HTTPS and identifiable content.
2. Review the chosen destination and old page paths with the owner. Leave the
   purchase to the owner; no WordPress credential is needed here.
3. After setup, use `web_fetch_page` on the old homepage and a representative old
   page. Check final URLs and expected content; use `domain_tls_status` on the
   destination hostname. Check the destination's HTTP-to-HTTPS behavior too.
4. Report redirect, HTTPS and content separately. Unchecked or unfinished results
   are **pending**. DNS change is **not applicable** for the free address. If host
   URL eligibility or price remains unknown, say **confirm in your dashboard**.


## Host operations for skills/wordpress/references/subdomain.md

1. Identify the owned root domain, desired full subdomain, authoritative DNS
   provider, and installed host or existing deployment. DNS is managed where the
   nameservers point, which may differ from the registrar.
   [DNS ownership](https://wordpress.com/support/domains/custom-dns/).
2. Load the selected host's skill. Reuse its saved credential, connection card,
   publish preview and confirmed publish flow. Capture the actual public URL and
   a distinctive visible phrase from this revision for the content check.
3. Add the requested subdomain to the actual project in the host's console
   **before adding DNS**. Use the provider procedure below. The installed Netlify,
   Vercel and GitHub Pages targets have no `customDomain` option. Cloudflare's
   installed option expects a full active DNS zone and manages apex plus `www`;
   use its console for this external-DNS subdomain path.
4. Copy the exact required record from that project's domain settings. Include
   any ownership-verification record. Never derive a destination from the owner's
   name, copy a documentation example, or guess a shared CNAME.
5. Pass the actual hostname and provider records as `requirements` to `dns_plan`,
   then `dns_instructions`. Requirements use `purpose: "site"`, or `"tls"` for
   certificate requirements, with `records` containing `type`, full `name`, `value`
   and the supplied `ttl` when present. Resolve blockers before entry. Show each
   row's type, full name, registrar Host/Name, value and TTL. These tools plan;
   the owner enters the records. Preserve root-domain, mail and unrelated records.
6. Once entered, call `dns_verify` with the same hostname and requirements. It
   saves propagation tracking and checks authoritative nameservers; it never
   edits DNS. Call `domain_tls_status` with the subdomain as `domain`, then
   `web_fetch_page` with its HTTPS URL. Check the final URL and distinctive phrase,
   plus a representative page and stylesheet asset. A generic 200 or shared host IP is
   insufficient. If a tool is unavailable, leave its check pending.
7. Report **DNS**, **HTTPS** and **content** separately, each with observed
   evidence. Unfinished work is **pending**; retain mismatch or invalid results
   and explain the next action. Claim live only after the intended site is
   reachable over trusted HTTPS. Keep the deployment attached to the selected host.
