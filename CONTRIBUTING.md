# Contributing

## Dependency policy: minimum release age

New dependency versions must be **at least 14 days old** before an install picks them up
(supply-chain hardening: a freshly published, compromised release is usually caught within days).

- Enforced by `.npmrc` (`min-release-age=14`, in days; npm >= 11.10 — Node 24 ships a new enough npm).
  `@jini-ai/*` (our own packages) is exempt via `min-release-age-exclude`.
- Versions already in `package-lock.json` are unaffected; `npm ci` installs the lockfile as-is.
- Bump with `npm install <pkg>@<version>`; if the version is too young npm fails with `ETARGET ... with a date before <cutoff>`.
  Pick the newest release older than 14 days (`npm view <pkg> time --json`) and pin it.
- Do not override with `--min-release-age=0` / `--before` except for an audited security fix, and say so in the commit message.
