import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ValidationError } from "#src/platform/site-dir/index";

/**
 * @file The ONE `DeploymentDescriptor` every platform renderer (`./deploy-config-fly.ts`,
 * `./deploy-config-render.ts`, `./deploy-config-railway.ts`) is a thin, pure function over —
 * `tovu deploy config --target <fly|render|railway>`'s single source of truth (`cli/commands/
 * deploy-config.ts`).
 *
 * Purpose:
 * Every emitted config states the same small set of facts (image built from `./Dockerfile`, the
 * port it listens on, where its one persistent volume mounts, its health-check path, which env
 * vars must be set through the platform's own secret mechanism) — only the SERIALIZATION differs
 * per platform. Four independent generators each hardcoding these facts would mean four copies of
 * the same knowledge, silently rotting three at a time the day one of them changes. This module is
 * the fix: build the descriptor once, here, then hand it to whichever renderer the caller asked
 * for. A fifth platform is one new renderer file, never a change to this one.
 *
 * Derivation over hardcoding, wherever that's reasonably possible: {@link buildDeploymentDescriptor}
 * reads the repo's own already-committed files (`Dockerfile`, `fly.toml`, the `/readyz` route's own
 * source) rather than repeating their values as separate literals that could drift out of sync.
 * Each derivation names its exact source below; a field that genuinely can't be derived (which env
 * vars are load-bearing secrets — a semantic judgment call, not a textual pattern) is hardcoded with
 * a comment citing the code that was read to decide it, per this task's own instruction to do that
 * rather than silently guess.
 *
 * Architectural role:
 * `features/deployments` (a `PROMOTED_NO_DEEP_IMPORTS` module — `.dependency-cruiser.mjs`): reached
 * only through `./index.ts`, never by a deep import into this file directly.
 */

export type DeploymentTarget = "fly" | "render" | "railway";

/** One env var a production Tovu deployment needs set through the platform's OWN secret
 *  mechanism — a NAME only. No renderer in this module ever holds, and none may ever emit, a
 *  VALUE for any of these. */
export interface DeploymentSecret {
  readonly name: string;
  /**
   * "boot-blocking" — the production readiness gate refuses to start without a real value.
   * "recommended" — boot succeeds either way, but a real production feature fails closed
   * (`503 SECRET_STORE_UNCONFIGURED`) until it's set.
   */
  readonly requirement: "boot-blocking" | "recommended";
}

export interface DeploymentDescriptor {
  /** The Fly app name, reused as Render's service `name` too, so both platforms name the same
   *  logical deployment identically. Derived from `fly.toml`'s `app = "..."`. */
  readonly appName: string;
  /** The container port the process listens on. Derived from `Dockerfile`'s `EXPOSE` line. */
  readonly port: number;
  /** Repo-relative path to the Dockerfile every renderer builds from. Derived from `fly.toml`'s
   *  `[build] dockerfile = "..."`. */
  readonly dockerfilePath: string;
  /** The one persistent volume's mount path INSIDE the container — every site's `content.db`,
   *  `uploads/`, `themes/`. Derived from `fly.toml`'s `[[mounts]] destination = "..."`. A wrong
   *  value here is silent data loss on the next deploy, not a startup error. */
  readonly volumeMountPath: string;
  /** The volume's own name/id, reused as Render's `disk.name` and referenced in Railway's
   *  volume-creation note for cross-platform naming consistency. Derived from `fly.toml`'s
   *  `[[mounts]] source = "..."`. */
  readonly volumeName: string;
  /** HTTP path the platform should poll to learn whether Tovu is actually ready to serve traffic
   *  (503 until migrations/seeding finish) — not `/health`, which only proves the process is
   *  alive. Derived from the real registered route (`registerReadyzRoute`). */
  readonly healthCheckPath: string;
  /** Env vars every renderer must declare by NAME on its platform. See {@link REQUIRED_SECRETS}'s
   *  own doc for exactly how each entry here was decided. */
  readonly secrets: readonly DeploymentSecret[];
}

/** What a render function actually needs from its caller beyond the descriptor: the ONE fact that
 *  can never be derived from this repo, because it names something about the TARGET DEPLOYMENT,
 *  not about Tovu itself. No renderer may default this — see each renderer's own validation. */
export interface RenderDeployConfigOptions {
  readonly region: string;
}

/** One platform's generated config, plus whatever it could NOT express inside the file itself
 *  (creating a volume out of band, prompting for a secret's real value through the platform's own
 *  UI/CLI) — every renderer returns this same shape so `cli/commands/deploy-config.ts` needs no
 *  per-platform branch beyond picking which render function to call. */
export interface RenderedDeployConfig {
  /** The filename this platform expects at its own conventional location (repo root). */
  readonly filename: string;
  /** The full file contents. Never contains a secret VALUE — only names, when a platform's own
   *  format has a way to declare "this key exists, prompt for it" (Render's `sync: false`); Fly's
   *  and Railway's formats have no such field at all, so their secrets appear only in `notes`. */
  readonly contents: string;
  /** Human-readable follow-up steps the file itself cannot express — volume creation, where to go
   *  set each secret's real value. Printed by the CLI, not written into any generated file. */
  readonly notes: readonly string[];
}

/**
 * The secrets every renderer must declare by name.
 *
 * CORRECTION (this pass): an earlier version of this comment claimed this list was "verified
 * against the actual boot-gate code" — that claim was false: `ANALYTICS_ROOT_KEY_SEED` was
 * boot-blocking (`index.ts:229` feeds `runProductionReadinessGate` via `production-readiness-gate.
 * ts:77-84`) but absent from `REQUIRED_SECRETS`, so every generated config omitted it and a
 * deployer following one would hit `PRODUCTION_BOOT_UNSAFE_DEFAULT: dev-secret-placeholder` on
 * first boot with no warning from this tool. Fixed below. A false "verified" claim is worse than no
 * claim at all — this comment now enumerates the actual verification, not an assertion of one.
 *
 * `production-readiness-gate.ts`'s `collectUnsafeDefaultFailures` reads exactly four
 * `EnvSnapshot` fields (`server/runtime/boot/production-readiness-gate.ts:77-84`); `index.ts:225-234`
 * is the ONE place that computes all four for a real boot. Enumerated here exhaustively, not just
 * the ones that happened to need an entry:
 *
 * 1. `hasDevSecretPlaceholder` ("dev-secret-placeholder") — `index.ts:229`:
 *    `!process.env.ANALYTICS_ROOT_KEY_SEED`. Boot-blocking, and NAMES A REAL SECRET
 *    (`registerAnalyticsIngestRoute`'s wiring in `app.ts` falls back to the literal dev placeholder
 *    `"dev-only-insecure-seed"` whenever this is unset) — covered by the `ANALYTICS_ROOT_KEY_SEED`
 *    entry below.
 * 2. `hasLocalhostEgressAllowance` ("localhost-egress-allowance") — `index.ts:230`: hardcoded
 *    `false`, unconditionally, for every real boot. `index.ts`'s own comment on that line discloses
 *    why: `deps.ts` seeds a hardcoded `localhost`/`example.com` origin+egress-allowlist with no env
 *    var escape hatch yet, so this check cannot currently distinguish a real deploy from a dev one.
 *    No env var gates it today — nothing for this list to declare. NOT a secret this module can
 *    surface; flagged here so a future fix to that gap doesn't silently need a `REQUIRED_SECRETS`
 *    update this comment failed to anticipate.
 * 3. `hasAlwaysOnAnalyticsStub` ("always-enabled-analytics-stub") — `index.ts:231`: hardcoded
 *    `false`, unconditionally (ADR-046 Phase 1's analytics slice wired the durable `SqliteBufferSink`
 *    for every composition root). No env var gates it today either — nothing for this list to
 *    declare.
 * 4. `hasDefaultOwnerPassword` ("default-owner-password") — `index.ts:232`:
 *    `(process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD) === DEFAULT_OWNER_PASSWORD`. Boot-
 *    blocking — covered by the `TOVU_ADMIN_PASSWORD` entry below.
 *
 * So of these four, exactly two are actually env-var-gated today (1 and 4) — both now have a
 * `REQUIRED_SECRETS` entry; the other two (2 and 3) have no env var to declare, not a gap in this
 * list.
 *
 * Also checked against this repo's own already-reviewed deployment docs, not just `.env.example`
 * (which lists `TOVU_INTEGRATIONS_ROOT_KEY` alone, under a single undifferentiated "Required"
 * heading that turns out not to match what the code enforces):
 *
 * - `TOVU_ADMIN_PASSWORD` — "boot-blocking". Check 4 above. `docker-compose.yml`'s own "Required"
 *   env block (`${TOVU_ADMIN_PASSWORD:?set TOVU_ADMIN_PASSWORD in .env}`) already draws the
 *   identical line.
 * - `ANALYTICS_ROOT_KEY_SEED` — "boot-blocking". Check 1 above.
 * - `TOVU_INTEGRATIONS_ROOT_KEY` — "recommended". Absent entirely from
 *   `production-readiness-gate.ts`'s checks — boot succeeds without it — but every route needing
 *   at-rest secret encryption (the visitor assistant's provider credential, the newsletter
 *   integration) fails closed with `503 SECRET_STORE_UNCONFIGURED` until it's set
 *   (`.env.example`'s own header on this var; `assistant/execution-credential-store.ts:129`).
 *   `docker-compose.yml` calls this exact var "Strongly recommended", distinct from "Required",
 *   for the same reason.
 *
 * Deliberately EXCLUDED, both checked against the same code rather than assumed:
 * - `TOVU_ADMIN_USER` — `docker-compose.yml` sets it inline as `${TOVU_ADMIN_USER:-admin}`, a plain
 *   default with no `:?` gate; `production-readiness-gate.ts` never reads it. A username, not a
 *   credential value worth routing through a secret store.
 * - `JINI_AGENT_DAEMON_PORT` — a port number with a working default already baked into the image
 *   (`Dockerfile`'s `ENV ... JINI_AGENT_DAEMON_PORT=4319`), not credential-shaped.
 *
 * Both differ from `deployment-overview.ts`'s own `REQUIRED_ENV_VAR_NAMES`
 * (`server/inbound/admin-http/routes/system/deployment-overview.ts:121-126`), which lists all four
 * for a broader admin-UI "here's what to be aware of" readout. This list answers a narrower
 * question — which env vars a DEPLOY CONFIG must actually declare as secrets — so it isn't the same
 * list, on purpose.
 */
const REQUIRED_SECRETS: readonly DeploymentSecret[] = [
  { name: "TOVU_ADMIN_PASSWORD", requirement: "boot-blocking" },
  { name: "ANALYTICS_ROOT_KEY_SEED", requirement: "boot-blocking" },
  { name: "TOVU_INTEGRATIONS_ROOT_KEY", requirement: "recommended" },
];

/**
 * One note every renderer includes verbatim: `content.db`'s schema — including any new table —
 * migrates automatically on every boot, never a separate deploy step. Verified, not assumed, for
 * the production image specifically: `platform/db/sqlite/content-db.ts`'s `openContentDb` calls
 * drizzle's `migrate()` unconditionally, before `app.listen()`, and its `MIGRATIONS_DIR` resolves
 * relative to its own compiled location (`import.meta.url`) — `dist/src/platform/db/drizzle` at
 * runtime. `Dockerfile`'s `RUN npm run build` copies `platform/db/drizzle/` there (its own comment:
 * "drizzle migrations stay under `dist/src/db/`" — the build script's literal `cp -R
 * apps/website/src/platform/db/drizzle/. dist/src/platform/db/drizzle/`), and `CMD ["node",
 * "dist/src/index.js"]` boots the exact same `openContentDb()` path. Worth stating explicitly now:
 * the SPEC-022 durability fix (gated-mutations' new durable `SqliteTokenStore`) added a
 * `gated_mutation_tokens` table via migration `0052` — the first deploy after that fix creates it
 * with no manual migration command required, and this note is what tells a deployer that.
 */
export const MIGRATIONS_NOTE =
  "content.db's schema (including new tables — e.g. gated_mutation_tokens, added by the SPEC-022 gated-mutations durability fix, migration 0052) migrates automatically on every boot. No separate migration command is needed before or after this deploy.";

/**
 * Guards a value about to be interpolated, unescaped, into a generated TOML/YAML config file
 * (`./deploy-config-fly.ts`'s `fly.toml`, `./deploy-config-render.ts`'s `render.yaml`) — unlike
 * `./deploy-config-railway.ts`'s `renderRailwayConfig`, which is safe by construction because it
 * builds its config through `JSON.stringify` rather than a hand-written template string. Two
 * distinct sink shapes call this, so it covers two distinct hazards:
 *
 * 1. QUOTED sinks (`deploy-config-fly.ts`'s `app = "${...}"`, `source = "${...}"`,
 *    `primary_region = "${...}"`; `deploy-config-render.ts`'s `region: ${...}` after it already
 *    passed `RENDER_VALID_REGIONS`). A value containing a double-quote can close the quoted
 *    string early; one also containing a newline can then inject an entirely new top-level key on
 *    the next line (reproduced with `--region 'iad"\nprimary_region_evil="x'`, which emits a real
 *    extra `primary_region_evil` key into `fly.toml`).
 * 2. UNQUOTED YAML plain-scalar sinks (`deploy-config-render.ts`'s `name: ${descriptor.appName}`
 *    and the disk's `name: ${descriptor.volumeName}` — YAML, unlike the TOML sinks above, is
 *    rendered with no surrounding quotes at all). Here a `"`/newline isn't the only hazard: `:`,
 *    `#`, `{`, `[`, `&`, `*`, a leading `-`, or leading/trailing whitespace are each YAML
 *    indicator/structural characters that change what an unquoted plain scalar means (`:` or `#`
 *    can end the scalar and start a new key or a comment mid-line; `{`/`[` open a flow collection;
 *    `&`/`*` are anchor/alias indicators; a leading `-` reads as a block-sequence entry) — the
 *    guard passing these through was this task's bug (`deploy-config-render.ts:65-78`).
 *
 * Rejecting outright is the reliable fix for both — a Fly region allow-list (the shape
 * `deploy-config-render.ts`'s `RENDER_VALID_REGIONS` uses) was considered too, but Fly's ~30-region
 * catalog had no authoritative source to enumerate against without risking rejecting a real region;
 * the same reasoning extends to app/volume names here — quoting the two unquoted YAML sinks at
 * render time was considered instead of widening this check, but every renderer's own exact-string
 * golden test already pins the CURRENT unquoted rendering for a safe name (e.g.
 * `deploy-config-render.unit.test.ts`'s `name: acme-app`), so unconditionally quoting would change
 * output for every already-safe app/volume name, not just unsafe ones — a real caller-visible
 * behavior change this task's own instructions rule out. Widening the reject-list here instead never
 * changes what an already-accepted value renders as; it only ever accepts fewer values, which is
 * exactly the tradeoff already made for `"`/newline above.
 */
export function assertNoConfigInjection(fieldLabel: string, value: string): void {
  if (value.includes('"') || value.includes("\n") || value.includes("\r")) {
    throw new ValidationError(`${fieldLabel} (${JSON.stringify(value)}) contains a quote or newline character, which would corrupt the generated config file`);
  }
  if (value.includes(":") || value.includes("#") || value.includes("{") || value.includes("[") || value.includes("&") || value.includes("*")) {
    throw new ValidationError(
      `${fieldLabel} (${JSON.stringify(value)}) contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file`
    );
  }
  if (value.startsWith("-") || value !== value.trim()) {
    throw new ValidationError(
      `${fieldLabel} (${JSON.stringify(value)}) starts with "-" or has leading/trailing whitespace, which would corrupt an unquoted YAML scalar in the generated config file`
    );
  }
}

/** Every path this module reads is repo-root-relative — same convention `dockerfile.ts`'s own
 *  `dockerfilePath()` already documents: `process.cwd()` is the resolution root because every
 *  caller (the CLI, and later any admin route reusing this same function) runs with its cwd at the
 *  Tovu repo root, true in dev and in the shipped image's `WORKDIR /workspace/Tovu`. */
function readRepoFile(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), "utf8");
}

/**
 * Regex-extracts one derived fact from an already-read repo file's contents, or fails LOUDLY: a
 * silent fallback here would be exactly the kind of drift this module exists to prevent (see this
 * file's own header). `describe`/`sourceFile` name the fact and its origin so the thrown message
 * tells a reader exactly what changed and where to look — never a bare "no match".
 */
function extractOrThrow(source: string, pattern: RegExp, describe: string, sourceFile: string): string {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `tovu deploy config: could not derive ${describe} from ${sourceFile} — its format changed since ` +
        `deploy-config.ts's extraction pattern was written. Update the pattern in deploy-config.ts to match ` +
        `the new format, or hardcode the value there instead with a comment explaining why it can no longer ` +
        `be derived.`
    );
  }
  return match[1]!;
}

/**
 * Builds the one `DeploymentDescriptor` every renderer works from, deriving each field from the
 * repo's own already-committed files (see each field's own doc on {@link DeploymentDescriptor} for
 * its exact source). Reads three real files from disk on every call rather than caching — this runs
 * once per CLI invocation, not in a hot path, so freshness (never serving a value from a file that
 * has since changed underneath a long-lived process) is worth more than the trivial I/O cost saved.
 *
 * @throws {Error} when a source file's format has drifted far enough that a derivation pattern no
 *   longer matches — see {@link extractOrThrow}. Never returns a guessed or partially-stale value.
 * @complexity O(1) — three bounded file reads, six fixed regex matches, no loop over caller data.
 */
export function buildDeploymentDescriptor(): DeploymentDescriptor {
  const dockerfile = readRepoFile("Dockerfile");
  const flyToml = readRepoFile("fly.toml");
  const healthRouteSource = readRepoFile("apps/website/src/server/inbound/public-http/routes/ops/health.ts");

  const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port", "Dockerfile (EXPOSE line)"));
  const dockerfilePath = extractOrThrow(flyToml, /\[build\][^[]*?dockerfile\s*=\s*"([^"]+)"/, "the Dockerfile path", 'fly.toml ([build].dockerfile)');
  const appName = extractOrThrow(flyToml, /^app\s*=\s*"([^"]+)"/m, "the app name", "fly.toml (app)");
  const volumeName = extractOrThrow(flyToml, /\[\[mounts\]\][^[]*?source\s*=\s*"([^"]+)"/, "the volume name", "fly.toml ([[mounts]].source)");
  const volumeMountPath = extractOrThrow(
    flyToml,
    /\[\[mounts\]\][^[]*?destination\s*=\s*"([^"]+)"/,
    "the volume mount path",
    "fly.toml ([[mounts]].destination)"
  );
  const healthCheckPath = extractOrThrow(
    healthRouteSource,
    /export const registerReadyzRoute[\s\S]*?app\.get\("([^"]+)"/,
    "the readiness check path",
    "server/inbound/public-http/routes/ops/health.ts (registerReadyzRoute)"
  );

  return {
    appName,
    port,
    dockerfilePath,
    volumeMountPath,
    volumeName,
    healthCheckPath,
    secrets: REQUIRED_SECRETS,
  };
}
