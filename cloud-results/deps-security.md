# deps-security — 2026-11-16 (branch deps/security-2026-11-15, base integ/wave-b)

Rule: target must be published >=14 days before 2026-11-16 (cutoff 2026-11-02). Node 24.22.3.

## Tovu (npm)
| package | from -> to | published | advisory | tests | result |
|---|---|---|---|---|---|
| handlebars | 4.7.10 already locked | 4.7.10: 2026-10-05 | CRITICAL (>=4.7.10) | none needed | **already satisfied on base, no commit** |
| drizzle-orm | 0.45.2 already | 2026-03-27 | >=0.45.2 | - | already satisfied |
| liquidjs | 10.27.2 already | 2026-07-09 | >=10.27.2 | - | already satisfied |
| sharp | 0.35.5 already | 2026-09-27 | >=0.35.5 | - | already satisfied |
| undici | 7.30.1 already (root+desktop) | 2026-10-15 | >=7.30.1 | - | already satisfied (7.30.2 exists, published 11-05, too new) |
| body-parser (express 4.22.2) | 1.20.9 already | 2026-10-22 | >=1.20.9 | - | already satisfied |
| proxy-addr | 2.0.8 already | 2026-09-15 | >=2.0.8 | - | already satisfied |
| @modelcontextprotocol/sdk (root) | 1.32.1 already | 2026-10-05 | >=1.32.0 | - | already satisfied |
| astro (dev) | 7.2.10 already | - | >=7.2.8 | - | already satisfied |
| shell-quote (dev) | 1.12.0 already | 2026-10-02 | >=1.11.0 | - | already satisfied |
| **@modelcontextprotocol/sdk (apps/desktop)** | 1.30.0 -> 1.32.2 | 2026-10-23 | high, <=1.31.0 (OAuth credential forwarding etc.) | desktop typecheck + `npm test` | commit 64fc8d10 |
| **electron (apps/desktop, dev)** | 43.6.0 -> 43.8.6 | 2026-10-31 | high, <43.8.1 | desktop typecheck + `npm test` (unit only) | commit 2f1766c3 |

Notes
- Electron: newest 43.x that is >=14 days old is 43.8.6 (43.8.7 was published 2026-11-03, one day inside the window). **A packaged-desktop smoke check is still owed before release.**
- Desktop `npm test` and typecheck: identical results before and after each bump (1407 tests, 1331 pass, 66 fail; 1 tsc error `@jini-ai/core/contracts/runtime`). All pre-existing on base, unrelated to these bumps. Not fixed.
- Skipped/untouched by instruction: nodemailer, zod.
- Root tests for handlebars/liquidjs/drizzle/sharp not run (no change to those packages).

### npm audit --omit=dev
- Root: before 26 (5 moderate, 21 high) -> after 26 (unchanged; no root change). Remaining high are nodemailer, zod and the @jini-ai/* chains depending on zod.
- apps/desktop: before 15 (4 moderate, 11 high) -> after 14 (4 moderate, 10 high). Remaining: zod, hono/@hono/node-server, fast-uri, ip-address (moderate), not in scope.

## Jini (pnpm, --config.prefer-workspace-packages=true)
| package | from -> to | published | advisory | tests | result |
|---|---|---|---|---|---|
| **@modelcontextprotocol/sdk** (packages/mcp dep+dev, examples/reference-web; no packages/chat declaration exists) | 1.29.0 -> 1.32.2 | 2026-10-23 | high, <1.32.0 | mcp typecheck/tests | commit 18894d83 + changeset (@jini-ai/mcp patch) |
| **tinypool** (transitive of vitest 2, sandbox/vibecoding) | 1.1.1 -> 2.1.2 via pnpm.overrides | 2026-08-23 | CRITICAL prototype-pollution RCE <2.1.2, dev-only | sandbox 179/179 pass; vibecoding 361/363 | commit c598fe58 + changeset (sandbox, vibecoding patch) |
| undici (platform/devops/sandbox) | 7.30.2 already locked | - | listed undici advisories affect only 8.x | - | no change |
| dompurify (cms, dev) | 3.4.18 already locked (spec ^3.4.17) | 3.4.18: 2026-11-14 | >=3.4.17 | - | satisfied, no change |

Notes
- MCP bump also moved transitive jose 6.2.4->6.2.13, qs 6.15.3->6.17.1, content-type 2.0.0->2.1.0 (all >=14 days old).
- mcp tests: same 2 failures + 2 suites failing to load (missing @jini-ai/daemon build output) before and after. Pre-existing: `pnpm build` of http-kit fails on base (sse.test.ts TS2344), so no full `pnpm -r build` baseline was green. vibecoding's 2 failures are identical on base.
- Not touched (outside listed scope): electron in packages/devops (peer, auto-installed) and examples/reference-desktop (^43.2.0) still flagged high <43.8.1; transitive fast-uri/hono/ip-address (via MCP SDK) still flagged; zod. Suggest follow-up: reference-desktop electron -> ^43.8.6.

### pnpm audit --prod
- Before: 59 (7 low, 34 moderate, 18 high, 0 critical)
- After: 53 (7 low, 32 moderate, 14 high, 0 critical). Remaining high: fast-uri 6, electron 5, ip-address 1, zod 1.
