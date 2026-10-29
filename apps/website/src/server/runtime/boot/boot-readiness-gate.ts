import { homedir } from "node:os";
import { siteKeySources } from "#src/features/webhooks/index";
import { runProductionReadinessGate } from "./production-readiness-gate.js";
import { CAPABILITY_INVENTORY } from "../configuration/capability-inventory.js";
import { DEFAULT_OWNER_PASSWORD } from "../../../features/identity/wiring.js";
import { inspectSiteKeyMaterial } from "#src/features/webhooks/index";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { warnOnBootReadinessGaps } from "./boot-readiness-warnings.js";
import { bootLocalOwnerSignIn } from "./local-owner-signin.js";
import { isLoopbackHost } from "./bind-host.js";
import type { IdentityRouteDepsSlice } from "#src/features/identity/wiring";

/** Refuse network exposure of the stored development credential in production mode.
 * Environment changes do not rotate an initialized site's password. Await seeding and use the
 * same stored-hash verifier as the password-status route; lookup/verification errors abort boot.
 * Local mode is exempt: ordinary `npm run dev` binds the LAN on purpose with the seeded default.
 * The index boot reserves a 503-only socket first; this guard precedes attaching its auth app.
 * @complexity O(1): one owner lookup and one password verification before serving credentials.
 */
export async function assertSafeOwnerCredentialBeforeListen(
  { deps, host }: { deps: Pick<IdentityRouteDepsSlice, "identityReady" | "ownerPrincipalId" | "userRepo" | "passwordHasher"> & { workspaceId: string }; host: string | undefined },
  _optional: Record<string, never> = {},
): Promise<void> {
  if (isLoopbackHost(host) || resolveRuntimeMode() !== "production") return;
  await deps.identityReady;
  const owner = await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId: await deps.ownerPrincipalId });
  if (!owner) throw new Error("Refusing network exposure: owner credential could not be verified.");
  if (await deps.passwordHasher.verify({ hash: owner.passwordHash, password: DEFAULT_OWNER_PASSWORD })) {
    throw new Error("Refusing network exposure: default-owner-password is still stored; rotate the owner password before listening.");
  }
}

/**
 * @file Shared production-readiness wiring for `index.ts` and `tovu serve`
 * (SPEC-022 REQ-03/W-001). Both entrypoints read the same runtime mode and call this
 * owner so unsafe-default containment cannot drift between boot paths.
 * The async gate belongs at top-level boot, not in synchronous/hermetic `deps.ts`
 * or `app.ts` factories (INV-06).
 *
 * A valid site key must resolve from env or a durable file before production boot.
 * An ephemeral container rootfs cannot preserve a generated fallback across redeploys;
 * accepting a missing key could leave sealed credentials unreadable. The inline
 * snapshot checks document the shared containment policy.
 */
export async function runProductionReadinessGateOrExit(): Promise<void> {
  // Warnings first and in EVERY mode: the "deployed but not in production mode" warning exists
  // precisely for the boots the refusal gate below returns early on. Never refuses or throws.
  warnOnBootReadinessGaps();
  if (bootLocalOwnerSignIn.warning) console.warn(bootLocalOwnerSignIn.warning);
  const mode = resolveRuntimeMode();
  if (mode !== "production") return;

  const sources = siteKeySources({ mode, env: process.env, home: homedir(), cwd: process.cwd() });
  const siteKeyStatus = inspectSiteKeyMaterial({ sources });
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
      // ADR-046 analytics durability: the real composition wires the durable SqliteBufferSink.
      hasAlwaysOnAnalyticsStub: false,
      // True when `TOVU_ADMIN_PASSWORD` is unset or still equal to `DEFAULT_OWNER_PASSWORD` — the
      // exact literal `identity/wiring.ts`'s `buildIdentityRouteDeps()` falls back to when seeding
      // the owner account. Imported from that module so this can never drift out of sync with what
      // the seeder actually did.
      hasDefaultOwnerPassword: (process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD) === DEFAULT_OWNER_PASSWORD,
      // True when NEITHER the env var NOR a valid key file resolves to usable site-key material —
      // `inspectSiteKeyMaterial()` is the SAME env-first/file-second check `EnvOrFileKeyring`'s own
      // `resolveSiteKey()` uses, called here with its defaults so this reads the identical
      // `defaultSiteKeyFilePath()` any instance would (which is mode-aware — the durable
      // `<cwd>/sites/.tovu/...` path in production, not `homedir()`; see that function's own doc).
      // Valid generated key files count too, or boot could refuse before the admin UI
      // that manages the key becomes reachable. Corrupt hex and absent material both
      // report missing-site-key: neither is safe for production boot.
      hasMissingSiteKey: !siteKeyStatus.active,
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
