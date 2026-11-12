osv-scanner 2.2.2 `scan source` with explicit `-L` lockfiles: Tovu `package-lock.json`, `apps/admin/package-lock.json`,
`apps/desktop/package-lock.json`, `apps/site-chat/package-lock.json` (927 / 668 / 710 / 395 packages; 4 local
`file:`/workspace packages filtered as unscannable); Jini `pnpm-lock.yaml` (1335 packages).
The online API (`api.osv.dev`) is blocked by this container's network policy (ENV, see below), so the scan used
osv-scanner's **offline** mode against the OSV npm database zip (`osv-vulnerabilities.storage.googleapis.com` is
reachable). One `osv.tsv` row = one advisory against one package@version in one lockfile, so a package present in
several lockfiles repeats; "unique" in the totals dedupes across lockfiles. Severity = the advisory's
`database_specific.severity` (GHSA label); where absent, the group's max CVSS score; else UNKNOWN. `fixed-in` = every
`fixed` event in the advisory's ranges for that package (`none` = no fixed version published).

`npm audit --json` (Tovu root workspace only, as the brief asks) and `pnpm audit --json` (Jini) are counted from
each tool's own `metadata.vulnerabilities`. npm counts *packages* (a package is flagged once, at its worst
severity, including packages flagged only because a dependency is vulnerable — e.g. the `@jini-ai/*` entries);
pnpm counts *advisory × vulnerable range*. The two are not comparable to each other or to osv rows.
