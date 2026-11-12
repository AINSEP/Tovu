## SKIPPED / ENV items (exact errors)

- **ENV — osv online API blocked.** First osv-scanner run (online mode) failed for both repos:
  `error when retrieving vulns: max retries exceeded: attempt 4: request failed: Post "https://api.osv.dev/v1/querybatch": Forbidden`
  (agent proxy: `api.osv.dev:443 — connect_rejected`). Worked around with `--offline-vulnerabilities
  --download-offline-databases`; the offline DB came from `osv-vulnerabilities.storage.googleapis.com`. Same
  advisories, but no live API; DB snapshot time is in the versions table.
- **ENV — semgrep registry blocked.** `semgrep.dev:443 — connect_rejected` (`curl: (56) CONNECT tunnel failed,
  response 403`), so `p/security-audit`, `p/typescript`, `p/javascript`, `p/nodejsscan` could not be fetched;
  substituted with the offline rule sources described in section 3. Counts are therefore close to, not identical
  with, a registry-pack run.
- **Setup deviations (brief allows minimum setup).** Done: Node 24, Jini `pnpm install --frozen-lockfile` (EXIT 0,
  `raw/jini-install.txt`) and `pnpm --no-bail -r build` (EXIT 0, `raw/jini-build.txt`); Tovu `npm ci` in root,
  `apps/admin`, `apps/desktop`, `apps/site-chat` (all EXIT 0, `raw/tovu-npm-ci.txt`). Not done (not needed for
  any check): `npm run build --workspace @tovu/sdk`, `npm run link:jini`, desktop `build:preload` — Tovu's typed
  lint resolves `@jini-ai/*` from the published copies in its own `node_modules`.
- **Typed lint — files not type-loaded** (listed in full below and in `floating-promises-skipped.tsv`): files that
  no tsconfig includes, so the project service (or, for desktop, the given `project` list) cannot type them.
  Those files were not linted for promises; every other file in the unit was.
- **Semgrep partial parses**: files semgrep could only partially parse / timed out on (counts in the totals
  table; per-file detail in `raw/semgrep-*.json` `errors`). Findings in those files may be undercounted.
- **Semgrep / a11y / typed lint ignore inline suppressions**: typed lint and a11y run with `noInlineConfig`, so
  hits under an existing `eslint-disable` are counted (deliberately: the audit measures, it does not trust waivers).
