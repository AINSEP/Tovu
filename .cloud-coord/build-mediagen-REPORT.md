# build-mediagen — REPORT (2026-10-21)

Branch `cloud/build-mediagen-2026-10-21` in both repos (from `cloud/integration-2026-10-21`). Design:
`.cloud-coord/mediagen-DESIGN.md`. All pushes succeeded; no force-push, no reset.

## What changed
**Jini (`@jini-ai/integrations/media-providers`)** — generic contract
- `createMediaProviderRegistry()` on the shared `@jini-ai/core/provider-registry` (contract `media`):
  each vendor is ONE `MediaProviderContribution` = `{ provider, models[], adapters }`. Today's consts +
  built-in adapters are the default contribution set (`builtinMediaProviderContributions()`).
- Plugin contributions validated and refused (never thrown): models must belong to the provider, no
  model id another provider serves on the same route, adapters need `buildRequest`/`parseResponse`.
- The registry is both `VendorAdapterLookup` and new `MediaModelCatalog`; `createMediaDispatchEngine`
  takes optional `catalog` (absent = unchanged static validation, so all existing callers behave the same).
- Id grammar decision: registry key = public id with `-`→`_` (`custom_image`); public ids, credentials,
  settings unchanged. Old `createBuiltinVendorAdapterRegistry`/`mediaVendorRegistry` kept, deprecated.
- Merged the shared helper from `cloud/build-provfix-2026-10-21` (`ddc1e606`) — no TEMP file needed.

**Tovu** — wiring
- `features/media-generation/media-provider-registry.ts`: `loadMediaProviderRegistry` = built-ins +
  Agent Plugin vendors from `tovu-media-providers.json` via shared `defineProviderContribution` /
  `contributeProviders` (same trust gates as mail adapters). Manifest id must equal the vendor's
  registry id. Every fault (incl. a loader I/O fault) is a refusal line; boot never fails.
- Built ONCE: `deps.ts` awaits it at composition and logs refusals; hermetic `app.ts` uses built-ins.
  `RouteDeps.mediaProviderRegistry` added.
- `media_generate_asset`: no per-call registry rebuild; engine uses the composed registry as lookup +
  catalogue; model enum, validation, default-model order and vendor labels come from the live registry
  (built-in order byte-identical, pinned by test). Metadata-only construction falls back to the
  built-in enum.
- Credentials unchanged in shape: saved credential first, env (built-ins only) second. The credential
  store accepts an injected provider catalogue → exact plugin ids can be saved (aliases never resolved).
  `media_list_providers` + credential card list from the registry. The admin whole-map PUT never
  tombstones a plugin vendor's key by omission (the admin tab does not render plugin vendors).

## Commits
Jini: `b6242daa` registry+engine · `1b22ddc7` API.md · `5ae7f581` deprecations (broke a brace) →
`3f073359` fix. (Plus merge of provfix up to `ddc1e606`.)
Tovu: `ef24fd42` design+progress, `70ae06c0` loader+composition+enum · `1337674c` store/
listing accept plugin vendors · `cbe7d4d6` tool tests · `b061b537` loader tests · `7bb4f6c3` no
tombstone fix · `cd883782` fixture · `0fd3e65f` metadata-only construction · `26bcc0b8` progress ·
`1e95c69c` admin PUT test · (this report).

## Verification
- Jini integrations: 77 files / 1637 tests pass; new + touched files 100% (engine.ts now 100%, was
  98.6%). Package total still <100% from untouched files (polling-adapter, ssrf-guard, webhooks…).
  `tsc --noEmit` clean.
- Tovu: media-generation + media credential tests pass; per-file coverage: media-provider-registry.ts,
  agent-tools.ts, provider-credential-store.ts, provider-credential-save.ts 100%;
  tool-registrations.ts branches 96.1% (baseline 91.7%), providers-tools.ts 98.6%/89.3% fn (baseline
  98.6%/88.9%) — remaining gaps pre-exist.
- Sweep of all 90 test files that build assistant registrations: 1472 pass / 0 fail. Broad set
  (admin media routes, composition, boot): only `*.postgres.test.ts` fail (need a Postgres server).
- `tsc -p tsconfig.json` / `tsconfig.tests.json`: only pre-existing errors (import-site, backstop,
  ContentKernel, consentAudit, permanent-delete-deps …), none in touched code.
- Known flake: `providers-tools.test.ts` "L241 cancelled" failed once under load, passed on 2 reruns.

## Not done / follow-ups
- Admin "Media providers" tab still renders the static browser catalogue → plugin vendors are keyed
  via the assistant credential card (or PUT), not shown in the tab. Needs a server-provided catalogue.
- Plugin activation after boot needs a restart (registry built once by design).
- Plugin vendors get no env-var credential fallback (by design: no env names trusted from plugin data).
- Jini `pnpm guard` self-test fails on an unrelated fixture (agent-runtime connection-guard parity) —
  not caused by this build.
- No bundled example media plugin shipped (none existed; loader is tested against a temp plugin).

## LOCAL-RUN NEEDED
- `*.postgres.test.ts` in `server/runtime/composition/__tests__` (Postgres server).
- Admin/browser checks of the Media providers tab (unchanged code, but plugin keys now preserved).
- Real vendor generation with a live key (only fakes used).
