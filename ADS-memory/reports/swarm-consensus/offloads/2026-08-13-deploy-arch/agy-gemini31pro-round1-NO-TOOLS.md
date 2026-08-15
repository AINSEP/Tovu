ACK_PACKET_RECEIVED CTX-DEPLOY-ARCH-2026-08-13 -- I received the packet and will work on it.

### 1. Claim Ledger

1. **TRUE.** Evidence: `src/server/app.ts:888-895`, `src/cli/program.ts:46`
2. **TRUE.** Evidence: `src/features/theme/theme.ts:24-35`
3. **TRUE.** Evidence: `src/server/http/site/render.ts:2004-2044`
4. **TRUE.** Evidence: `src/server/http/site/render.ts:2004-2044`, `src/server/http/site/liquid-sandbox.ts:4-6`
5. **TRUE.** Evidence: `src/server/http/site/liquid-sandbox.ts:4-9`
6. **TRUE.** Evidence: `src/server/http/site/liquid-sandbox.ts:9-12`
7. **TRUE.** Evidence: `src/index.ts:305-312`
8. **TRUE.** Evidence: `src/assistant/byok-provider-turn.ts:2-5`, `src/assistant/byok-provider-turn.ts:19-21`
9. **TRUE.** Evidence: `src/index.ts:311`, `src/assistant/byok-provider-turn.ts:13-21`
10. **UNVERIFIABLE.** Host capability/constraints are not in the bundle.
11. **UNVERIFIABLE.** Host preferences are not in the bundle.
12. **UNVERIFIABLE.** Cloudflare/Vercel runtime specs are not in the bundle.
13. **UNVERIFIABLE.** Postgres migration details are not in the bundle.
14. **UNVERIFIABLE.** Pricing and cost models are not in the bundle.
15. **UNVERIFIABLE.** The bundle confirms `sitemap.ts` (`ls src/server/routes/site/`), but "comparatively cheap" is an architectural opinion. 
16. **FALSE.** Corrected: Five files handle POSTs. `newsletter-confirm.ts` is not a POST handler. Evidence: `POST handlers in site routes` list.
17. **PARTLY.** Corrected: Rate limiting uses `(sourceIp, formDefinitionId)` (`src/forms/submit-service.ts:85`), but `resolveClientIp`, edge function porting, and Stripe webhook constraints are unverifiable.
18. **UNVERIFIABLE.** Speculative architecture opinion not in the bundle.
19. **TRUE.** Evidence: `container files present?` block.
20. **TRUE.** Evidence: `root package.json file: deps + native`, `apps/admin file: dep count`.
21. **TRUE.** Evidence: `root package.json file: deps + native`, `.gitignore:16-23`.

### 2. Position

I recommend **Option A (Container-first)** combined with gating the Jini daemon to run conditionally. 

Tovu relies on a persistent stateful server for essential logic: `worker_threads` for secure Liquid/Handlebars sandboxing, local filesystem access for uploads and SQLite (`infra/`), and 5 vital POST endpoints that fail under pure static export. The commerce stress-test perfectly illustrates this: static export fundamentally oversells inventory, which is unacceptable for production. 

Furthermore, packaging this via Docker is necessary due to the 22 `file:` dependencies pointing to the sibling Jini checkout—deploying to Vercel/Cloudflare would currently require either monorepo acrobatics or publishing unready internal packages to NPM. Containers deployed to Fly/Render represent the cheapest, highest-fidelity path to a working Vercel-like "Deploy" button that respects the app's current native constraints and stateful architecture.

### 3. Ranked Solution Slate

1. **Option A (Container-first)** 
   *Criteria:* Time-to-value, architectural fidelity.
   *Trade-offs:* Requires building a Docker monorepo context to capture the `file:` deps. Foregoes native Vercel/Cloudflare targeting.
   *Commerce:* Survives the stress test. Live POST handlers correctly lock stock and validate prices.
2. **Option C (Serverless-compatible Tovu)**
   *Criteria:* Commercial alignment (Vercel).
   *Trade-offs:* High engineering cost. Requires a database rewrite (Postgres), an object-storage rewrite (S3 uploads), and a solution for the `worker_threads` sandbox (since Cloudflare Workers lack node API support). 
   *Commerce:* Survives the stress test via live API endpoints.
3. **Option E (Deployment class by feature)**
   *Criteria:* Flexibility.
   *Trade-offs:* Disastrous user experience. A static site would suddenly require a complex server migration the moment a user installs a comment plugin or ecommerce block.
   *Commerce:* Relegates commerce to the stateful tier, which works, but bifurcates the codebase.
4. **Options B & D (Static export / Publish-time render)**
   *Criteria:* Security, cost.
   *Trade-offs:* Completely castrates dynamic features.
   *Commerce:* Fails catastrophically. Prices and inventory stale instantly after publishing. 

### 4. Strongest Argument Against My Position

The owner specifically stated that Vercel and Cloudflare support "matters commercially." Customers expect one-click serverless deployments, and Option A abandons that entirely. Additionally, asking non-technical users to manage Docker volume mounts or object storage just to keep SQLite alive introduces friction that contradicts the ethos of an AI-powered CMS.

### 5. What Would Change My Mind

If the 22 `file:` dependencies to the sibling Jini repo can be easily swapped to published NPM packages, AND `better-sqlite3` can be cleanly swapped to a serverless edge driver like `@libsql/client` (Turso) without rewriting the entire persistence layer, Option C becomes the optimal path.

### 6. Confidence

**0.9.** Uncertainty primarily stems from the unverifiable nature of Vercel/Cloudflare limitations within the scope of the provided bundle, and not knowing how tightly coupled the 22 sibling `file:` dependencies are to the local development environment.

<<SWARM_END>>
