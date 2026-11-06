# plugins-anywhere — in progress

Branch: `cloud/plugins-anywhere`; base: `542635a0ef1d904395a6ddc2aaa8d23808a14dcf` (`origin/cloud/combine`).

Implementing the owner-approved job in `origin/cloud-plans-1105:cloud/jobs/plugins-anywhere.md`.
Shared parser, bundled payload migration, host reader migration and effective guidance tests are in progress.

Compatibility: installed plugin identities remain stable; legacy extension and MCP aliases remain supported with host-visible warnings. Exact support period will be recorded before completion.

Validation: rebuilding Jini from the specified base; Tovu relink follows. Focused checks pending.

## Bugs found

- Existing host readers bypass the portable manifest namespace and cannot read neutral manifests consistently (job scope; fix in progress).

## Open

All five job items and final validation remain in progress. No deployment or publication.
