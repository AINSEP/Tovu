# F4 — Jini cms (L4) + commerce/capability-providers/integrations (L6) fix wave

## RUN LOG (append-only)
## 2026-10-25T21:34Z — STARTED
Jini base 3e2fbae8 (origin/cloud/overnight-1024-jini) → branch cloud/fixwave-1025-F4. Node 24.22, pnpm install + `pnpm -r build` green. Plan: lane musts (jwt length guard, isSecureProtocol, NOT_ASSESSED fallback, catalog repo.ts, cms schema assertions).
## 2026-10-25T21:44Z — PROGRESS
Lane musts done + pushed to Jini cloud/fixwave-1025-F4: jwt length guard (c05b8aeb..), visitor-auth loopback both ways, NOT_ASSESSED fallback, catalog repo.ts SQLite tests, cms catalog/widget contract pins. Next: integrations signing/ssrf-guard/saved-requests/credentialed-request, cms sanitize-svg/sniffer.
## 2026-10-25T21:51Z — PROGRESS
SOURCE BUG found+fixed: integrations webhooks/signing.ts verifySignature accepted "<valid digest>" + 1 trailing hex char (Buffer.from(hex) drops odd nibble) — failing test f5565f8c, fix 55b2630c. Also pushed: ssrf-guard, saved-requests, credentialed-request edges; cms sanitize-svg, sniffer, consent gate runtime exemption, receipt-id bounds. Jini HEAD 4fb362c1.
## 2026-10-25T22:31Z — PROGRESS
Coverage measured: capability-providers 100/100 (whole pkg), integrations touched files 100/100 (credentialed-request + saved-requests/schema closed), commerce payments+money 100/100 (vitest), catalog repo.ts 100 L / 98.78 B. CCN>10 source functions: 0 in all four packages (eslint complexity 10). Stryker re-score capability-providers: lifecycle 75.1→99.7, jwt 77.6→86.9, definitions 59.3→88.9, tokens 0→100, stripe 87.7→91.8, ws 83.3→85.2 (rest classified equivalent). FINDING: describe-level fixtures make a killed mutant look "survived" under Stryker (collection crash) — fixed in visitor-auth tests.
