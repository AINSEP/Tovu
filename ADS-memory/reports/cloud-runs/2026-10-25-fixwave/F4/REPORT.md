# F4 — Jini cms (L4) + commerce/capability-providers/integrations (L6) fix wave

## RUN LOG (append-only)
## 2026-10-25T21:34Z — STARTED
Jini base 3e2fbae8 (origin/cloud/overnight-1024-jini) → branch cloud/fixwave-1025-F4. Node 24.22, pnpm install + `pnpm -r build` green. Plan: lane musts (jwt length guard, isSecureProtocol, NOT_ASSESSED fallback, catalog repo.ts, cms schema assertions).
## 2026-10-25T21:44Z — PROGRESS
Lane musts done + pushed to Jini cloud/fixwave-1025-F4: jwt length guard (c05b8aeb..), visitor-auth loopback both ways, NOT_ASSESSED fallback, catalog repo.ts SQLite tests, cms catalog/widget contract pins. Next: integrations signing/ssrf-guard/saved-requests/credentialed-request, cms sanitize-svg/sniffer.
## 2026-10-25T21:51Z — PROGRESS
SOURCE BUG found+fixed: integrations webhooks/signing.ts verifySignature accepted "<valid digest>" + 1 trailing hex char (Buffer.from(hex) drops odd nibble) — failing test f5565f8c, fix 55b2630c. Also pushed: ssrf-guard, saved-requests, credentialed-request edges; cms sanitize-svg, sniffer, consent gate runtime exemption, receipt-id bounds. Jini HEAD 4fb362c1.
