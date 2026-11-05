import { homedir } from "node:os";
import { siteKeySources } from "#src/features/webhooks/index";
import { runProductionReadinessGate, type BootRefusalFailure } from "./production-readiness-gate.js";
import { CAPABILITY_INVENTORY } from "../configuration/capability-inventory.js";
import { DEFAULT_OWNER_PASSWORD } from "../../../features/identity/wiring.js";
import { inspectSiteKeyMaterial } from "#src/features/webhooks/index";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { warnOnBootReadinessGaps } from "./boot-readiness-warnings.js";
import { bootLocalOwnerSignIn } from "./local-owner-signin.js";

const READINESS_REMEDIES: Readonly<Record<string, string>> = {
  "dev-secret-placeholder": "Analytics uses a development seed. Set ANALYTICS_ROOT_KEY_SEED to a private, stable value in the deployment environment.",
  "default-owner-password": "TOVU_ADMIN_PASSWORD is unset or the default. If you already changed the owner password in Admin, set this variable to match or ignore this warning. Otherwise change the owner password in Admin.",
  "missing-site-key": "No usable site key was found. Set TOVU_SITE_KEY or generate a site key in Admin and keep its file on durable storage; sealed credentials need the same key after a redeploy.",
};

/** Boot stays available so the owner can repair configuration in Admin. No credential values are logged. */
function readinessWarning({ failure }: { failure: BootRefusalFailure }): string {
  const check = String(failure.details.checkName ?? failure.details.capabilityName ?? failure.code);
  const remedy = READINESS_REMEDIES[check] ?? `${failure.message.replace(/^Refusing to boot in production mode:\s*/, "")} Check this capability's deployment configuration.`;
  return `[production-readiness-gate] WARNING ${failure.code} (${check}): ${remedy} Boot continues.`;
}

/**
 * @file Shared production-readiness wiring for `index.ts` and `tovu serve`
 * (SPEC-022 REQ-03/W-001). Both entrypoints read the same runtime mode and call this
 * owner so unsafe-default containment cannot drift between boot paths.
 * The async gate belongs at top-level boot, not in synchronous/hermetic `deps.ts`
 * or `app.ts` factories (INV-06).
 *
 * A valid site key should resolve from env or a durable file for production use.
 * An ephemeral container rootfs cannot preserve a generated fallback across redeploys;
 * accepting a missing key could leave sealed credentials unreadable. Warn loudly while keeping
 * Admin reachable so the owner can repair it (owner: no security/readiness boot refusals).
 */
export async function runProductionReadinessGateOrExit(): Promise<void> {
  const mode = resolveRuntimeMode();
  const env = process.env;
  // Warnings first and in EVERY mode: the "deployed but not in production mode" warning exists
  // precisely for the boots the production assessment below returns early on. Never refuses or throws.
  warnOnBootReadinessGaps();
  if (bootLocalOwnerSignIn.warning) console.warn(bootLocalOwnerSignIn.warning);
  if (mode !== "production") return;

  const sources = siteKeySources({ mode, env, home: homedir(), cwd: process.cwd() });
  const siteKeyStatus = inspectSiteKeyMaterial({ sources });
  const result = await runProductionReadinessGate({
    mode,
    inventory: CAPABILITY_INVENTORY,
    envSnapshot: {
      // True when `ANALYTICS_ROOT_KEY_SEED` is unset, since `registerAnalyticsIngestRoute`'s wiring
      // in `app.ts` falls back to the literal dev placeholder `"dev-only-insecure-seed"` whenever
      // that env var is absent.
      hasDevSecretPlaceholder: !env.ANALYTICS_ROOT_KEY_SEED,
      // Not yet detectable here — `deps.ts` seeds a hardcoded `localhost`/`example.com`
      // origin+egress-allowlist unconditionally, with no env-var escape hatch, so this check cannot
      // yet distinguish a real deploy from a dev one. A disclosed gap, not fixed here.
      hasLocalhostEgressAllowance: false,
      // ADR-046 analytics durability: the real composition wires the durable SqliteBufferSink.
      hasAlwaysOnAnalyticsStub: false,
      // True when `TOVU_ADMIN_PASSWORD` is unset or still equal to `DEFAULT_OWNER_PASSWORD` — the
      // exact literal `identity/wiring.ts`'s `buildIdentityRouteDeps()` falls back to when seeding
      // the owner account. Imported from that module so this can never drift out of sync with what
      // the seeder actually did.
      hasDefaultOwnerPassword: (env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD) === DEFAULT_OWNER_PASSWORD,
      // True when NEITHER the env var NOR a valid key file resolves to usable site-key material —
      // `inspectSiteKeyMaterial()` is the SAME env-first/file-second check `EnvOrFileKeyring`'s own
      // `resolveSiteKey()` uses, called here with its defaults so this reads the identical
      // `defaultSiteKeyFilePath()` any instance would (which is mode-aware — the durable
      // `<cwd>/sites/.tovu/...` path in production, not `homedir()`; see that function's own doc).
      // Valid generated key files count too, or boot could refuse before the admin UI
      // that manages the key becomes reachable. Corrupt hex and absent material both
      // report missing-site-key: both need an actionable warning at production boot.
      hasMissingSiteKey: !siteKeyStatus.active,
    },
  });

  if (!result.ok) {
    for (const failure of result.failures) {
      console.warn(readinessWarning({ failure }));
    }
  }
}
