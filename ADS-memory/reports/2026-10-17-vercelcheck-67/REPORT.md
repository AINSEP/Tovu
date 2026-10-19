# vercelcheck-67 — 2026-10-17

Commits: Jini 8c3d6da0 (general-work, matcher + test); Tovu 86658283f (13 files; deps.ts committed as Codex's single hunk via git apply --cached, other lanes' deps.ts hunks left uncommitted).

Tests: Jini provider-matches.test.ts 3/3. Tovu node --test (custom-tokens.unit, store.unit, publish-agent-tools.unit, credential-copy-tool, local-credential-copy.integration, static-publish credentials.unit, verify.unit): 271 pass / 0 fail / 1 skip. New cases RED by construction (assert fields/behaviour absent on HEAD); not re-run on a HEAD scratch copy. Mutation: none (10-17 rule).
Root tsc -p tsconfig.json: 2 errors, both in files outside this job (agent-daemon-server.ts:1229 nativeCapabilities; permanent-delete-deps.ts:199 MediaRepoPort listRetiredSlugs) — other lanes' uncommitted work.

Security review: credentialSources only when localHost AND principal == ownerPrincipalId; summarizeCredentialSources allowlists kind/label/provider/publishHosts (no ids, no last4, no values); errors collapse to credentialSourcesUnavailable. Copy card shows last4 as before plus host names. Custom read model drops `sealed`; one decrypt only on resolve of the chosen/default row.
Minor (not fixed): local-credential-copy list() now awaits loadDeployTargets outside the per-source try, so a registry load failure would fail the whole copy card instead of just omitting publishHosts.

Env question: yes. content/agent-plugins/vercel/tovu-deploy-targets.json envFallback.tokenVars = [VERCEL_TOKEN, VERCEL_ACCESS_TOKEN]; createEnvPublishCredentialSource reads the first non-blank one; it is the fallback after saved DB credentials in the default "self-hosted-cli" mode (TOVU_EXECUTION_MODE != hosted-api-only). No alias needed; same pattern as GitHub/Netlify/Cloudflare. VERCEL_AI_GATEWAY_API_KEY is not read by the deploy path. Not verified: whether the zoran server process actually has VERCEL_ACCESS_TOKEN in its env (did not inspect process env; it prints secrets).

Real home: sites.json md5 changed at 13:57:50, before my first test (14:00); still the 5 owner sites (desktop lastOpened write). site-keys 860 unchanged. admin 200.
