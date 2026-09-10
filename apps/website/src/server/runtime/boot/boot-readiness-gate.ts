import { runProductionReadinessGate } from "./production-readiness-gate.js";
import { CAPABILITY_INVENTORY } from "../configuration/capability-inventory.js";
import { DEFAULT_OWNER_PASSWORD } from "../../../features/identity/wiring.js";
import { inspectRootKeyMaterial } from "#src/features/webhooks/keyring.env";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";

/**
 * @file Shared `runProductionReadinessGate()` wiring — extracted verbatim (no behavior change)
 * from `index.ts`'s own `runBootGateOrExit()`, which is where SPEC-022 REQ-03/W-001 was originally
 * enforced. `index.ts`'s own comment on why the gate call lives at a top-level boot path rather
 * than inside `deps.ts`/`app.ts` (both synchronous, hermetically tested, and not to be given an
 * async/await-a-gate signature change per INV-06) applies equally to `cli/commands/serve.ts` — the
 * OTHER real top-level boot path, and the one a packaged `tovu serve` install runs. That install
 * can be launched with `TOVU_RUNTIME_MODE=production` exactly as `index.ts` can (this check reads
 * nothing CLI- or non-CLI-specific — see `resolveRuntimeMode()`'s own header), so a `tovu serve`
 * deployment run in production mode had no unsafe-default containment at all before this file
 * existed. Both boot paths now call this ONE function so the gate can never drift between them —
 * mirroring `ensureAgentDaemonToken()`/`registerPluginSdkResolver()`, which already follow this
 * exact shared-function pattern for the identical "must run identically in both entrypoints" reason
 * (see either file's own header, or `serve.ts`'s 2026-09-05 dispatch comments referencing them).
 *
 * `envSnapshot`'s first four checks are unchanged from `index.ts`'s original implementation. The
 * fifth, `hasMissingIntegrationsRootKey`, was added by this fix (2026-09-09, integrations-root-key
 * silent-rekey gap): `TOVU_INTEGRATIONS_ROOT_KEY` used to be classified `"recommended"`
 * (`features/deployments/deploy-config.ts`'s `REQUIRED_SECRETS`) with no boot-gate check at all —
 * a container redeploy with the var unset booted fine and silently derived a new root key every
 * time (`EnvOrFileKeyring`'s generated-file fallback resolves against the container's ephemeral
 * rootfs, not the persistent volume). See this file's own inline comment on the field below for the
 * full mechanism. See this function's own inline comments below for what each check means; nothing
 * about their meaning is specific to either boot path.
 */
export async function runProductionReadinessGateOrExit(): Promise<void> {
  const mode = resolveRuntimeMode();
  if (mode !== "production") return;

  const result = await runProductionReadinessGate({
    mode,
    inventory: CAPABILITY_INVENTORY,
    envSnapshot: {
      // True when `ANALYTICS_ROOT_KEY_SEED` is unset, since `registerAnalyticsIngestRoute`'s wiring
      // in `app.ts` falls back to the literal dev placeholder `"dev-only-insecure-seed"` whenever
      // that env var is absent.
      hasDevSecretPlaceholder: !process.env.ANALYTICS_ROOT_KEY_SEED,
      // Not yet detectable here — `deps.ts` seeds a hardcoded `localhost`/`example.com`
      // origin+egress-allowlist unconditionally, with no env-var escape hatch, so this check cannot
      // yet distinguish a real deploy from a dev one. A disclosed gap, not fixed here.
      hasLocalhostEgressAllowance: false,
      // False as of ADR-046 Phase 1's analytics slice — `deps.ts`'s `createSqliteRouteDeps()` now
      // unconditionally wires the durable `SqliteBufferSink`.
      hasAlwaysOnAnalyticsStub: false,
      // True when `TOVU_ADMIN_PASSWORD` is unset or still equal to `DEFAULT_OWNER_PASSWORD` — the
      // exact literal `identity/wiring.ts`'s `buildIdentityRouteDeps()` falls back to when seeding
      // the owner account. Imported from that module so this can never drift out of sync with what
      // the seeder actually did.
      hasDefaultOwnerPassword: (process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD) === DEFAULT_OWNER_PASSWORD,
      // True when NEITHER the env var NOR a valid key file resolves to usable root-key material —
      // `inspectRootKeyMaterial()` is the SAME env-first/file-second check `EnvOrFileKeyring`'s own
      // `resolveRootKey()` uses, called here with its defaults so this reads the identical
      // `defaultRootKeyFilePath()` any instance would (which is mode-aware — the durable
      // `<cwd>/sites/.tovu/...` path in production, not `homedir()`; see that function's own doc).
      //
      // 2026-09-09 (durability fix, second pass): this used to check ONLY `process.env.
      // TOVU_INTEGRATIONS_ROOT_KEY`, which made a valid, already-generated key file invisible to
      // this gate — the exact chicken-and-egg the admin Site Token tab's Generate action would
      // otherwise hit (boot refuses before the admin UI that could "fix" it in-app is ever
      // reachable). A key file that exists but is not valid hex still counts as missing here
      // (`inspectRootKeyMaterial().active` is `false` for that case too, via its own `invalid`
      // branch) — this gate does not currently distinguish "absent" from "present but corrupt" in
      // its own failure code (`missing-integrations-root-key` either way); both are equally unsafe
      // to boot on, so the coarser signal is still correct, just not maximally specific.
      hasMissingIntegrationsRootKey: !inspectRootKeyMaterial().active,
    },
  });

  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`[production-readiness-gate] ${failure.code}: ${failure.message}`);
    }
    console.error("Refusing to boot in production mode — see failures above.");
    process.exit(1);
  }
}
