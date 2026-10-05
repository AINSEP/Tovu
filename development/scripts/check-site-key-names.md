# Site key name guard

Binding specification: `ADS-memory/.local-artifacts/plan-site-key-BCD-2026-09-24.md`, section 2.
Run `bash development/scripts/check-site-key-names.sh`; the coordinator runs the accompanying Node tests.
The scan includes tracked and untracked source, with the specification's history exclusions; unstaged deleted files are omitted. It requires over 1,000 files, zero forbidden-name lines, exactly four frozen lines, exactly sixteen compatibility lines, and a positive environment-name control. Adjacent shell quotes keep the guard's own pattern from counting itself. `SITE_KEY_LEGACY_EXPECTED` can override the compatibility expectation for retirement and test fixtures.

## Frozen lines: 4

Never change their cryptographic bytes. The extraction salt declaration in `features/webhooks/keyring.env.ts`, the salt use in `keyring.memory.ts`, the known-answer derivation in `__tests__/keyring.env.test.ts`, and the independent derivation in `__tests__/sealing-wire-format.pinned.test.ts` are the four counted lines.

The plan (section 0.4) counted three. The pinned wire-format test is the fourth: it spells the salt as a literal on purpose, so it checks the stored bytes independently of `HKDF_EXTRACTION_SALT`. Importing the constant, or splitting the string to dodge this guard, would let a change to the salt pass unnoticed.

## Compatibility lines: 13

The legacy environment name is no longer read at all (removed 2026-10-05, owner: single-user install); only `TOVU_SITE_KEY` is read.

All paths below are repo-relative. Each listed line is annotated with its removal date **2026-11-01**. Package compatibility lines require the corresponding release to be installed before removal; the date alone is insufficient.

| Path | Counted line / reason | Retirement |
|---|---|---|
| `apps/website/src/features/webhooks/site-key-sources.ts` | Legacy file-name constant | D3 after owner migration confirmation, on/after 2026-11-01 |
| `apps/website/src/features/webhooks/keyring.env.ts` | Import for `JiniFixedSiteKeyKeyring` | Install platform release with canonical exports, on/after 2026-11-01 |
| `apps/website/src/features/webhooks/keyring.env.ts` | Import for `JiniUnusableSiteKeyError` | Install platform release with canonical exports, on/after 2026-11-01 |
| `apps/website/src/features/webhooks/keyring.env.ts` | Import for `parseKeyHex` | Install platform release with canonical exports, on/after 2026-11-01 |
| `apps/website/src/features/webhooks/keyring.env.ts` | Import for `fingerprintKeyHex` | Install platform release with canonical exports, on/after 2026-11-01 |
| `apps/website/src/features/webhooks/keyring.env.ts` | Import for `generateKeyFile` | Install platform release with canonical exports, on/after 2026-11-01 |
| `apps/website/src/features/webhooks/keyring.memory.ts` | Import for `FixedSiteKeyKeyring` | Install platform release with canonical exports, on/after 2026-11-01 |
| `apps/website/src/features/webhooks/ports.ts` | Handle type re-export | Install platform release with canonical exports, on/after 2026-11-01 |
| `apps/website/src/features/webhooks/ports.ts` | Handle type import | Install platform release with canonical exports, on/after 2026-11-01 |
| `apps/website/src/features/webhooks/keyring.env.ts` | Installed platform error-name compatibility | Replace with canonical error constructor check after platform release, on/after 2026-11-01 |
| `apps/website/src/features/analytics/salt.ts` | Local `analyticsSeed` maps to the installed analytics argument | Requires analytics argument migration in Jini and release, on/after 2026-11-01 |
| `apps/website/src/features/analytics/jini-adapters.ts` | Local `analyticsSeed` maps to the installed analytics dependency field | Requires analytics argument migration in Jini and release, on/after 2026-11-01 |
| `development/todos.md` | Historical September 19 label preserved accurately | Rephrase the historical label reference at rename closeout, on/after 2026-11-01 |

The eight platform import/export lines retain the installed package API. Jini's `@jini-ai/platform` source now exposes eighteen canonical value/type names plus deprecated aliases, with thirty-six compatibility annotations in its secrets entry: eighteen implementation-binding re-exports and eighteen deprecated re-exports. Each entry identifies its canonical replacement and removal date. No version or publication was changed. The coordinator must publish an additive platform release after package validation, install it in Tovu, and update these imports. Analytics argument migration is a separate follow-up required before its two adapters can lose their compatibility fields.

## Staged source comment patch

The dispatch forbids in-place edits to schema files, including comments. Two comments in `apps/website/src/platform/db/schema.sqlite.ts` still contain the old term. The comment-only patch and installation notes are in `ADS-memory/.local-artifacts/codex-waves/features-2026-10-04/staged/site-key-job3/`. Until the coordinator installs it, the guard correctly fails on those two lines. There is no schema or migration change.
