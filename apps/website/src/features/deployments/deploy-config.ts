import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ValidationError } from "#src/platform/site-dir/index";
import type { DeploymentSecret, DeploymentDescriptor, RenderedDeployConfig, DeployConfigKit } from "@jini-ai/devops/deploy";

/**
 * @file The ONE `DeploymentDescriptor` every platform config generator is a thin, pure function over —
 * `tovu deploy config --target <id>`'s single source of truth (`cli/commands/deploy-config.ts`). The
 * generators themselves are plugin modules (the bundled hosting plugins'
 * `deploy-configs/*.mjs`, declared in each one's `tovu-deploy-configs.json`, loaded by `./deploy-config-registry.ts`); this file
 * keeps only the vendor-neutral half: the descriptor, the injection guard, the migrations note, and
 * the {@link DeployConfigGeneratorModule} port with the {@link DeployConfigKit} the host passes in.
 *
 * Purpose:
 * Every emitted config states the same small set of facts (image built from `./Dockerfile`, the
 * port it listens on, where its one persistent volume mounts, its health-check path, which env
 * vars must be set through the platform's own secret mechanism) — only the SERIALIZATION differs
 * per platform. Four independent generators each hardcoding these facts would mean four copies of
 * the same knowledge, silently rotting three at a time the day one of them changes. This module is
 * the fix: build the descriptor once, here, then hand it to whichever generator the caller asked
 * for. Another platform is one new plugin module plus one manifest line, never a change to this one.
 *
 * Derivation over hardcoding, wherever that's reasonably possible: {@link buildDeploymentDescriptor}
 * reads the repo's own already-committed files (`Dockerfile`, `package.json`, the `/readyz` route's own
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

/** The deployment descriptor, render options and result, the generator kit and the generator
 *  module port live in `@jini-ai/devops/deploy`; this file keeps the host-specific half. */
export type {
  DeploymentSecret, DeploymentDescriptor, RenderDeployConfigOptions, RenderedDeployConfig, DeployConfigKit, DeployConfigGeneratorModule,
} from "@jini-ai/devops/deploy";

/**
 * Non-secret runtime values every Tovu deploy config carries. The generators are host-neutral
 * plugin modules (`@jini-ai/agent-plugins/{fly,render,railway}`) that default no host switch, so the
 * production switch is Tovu's input: the caller merges this into `options.env` before render.
 * Without it a deployed server boots in local mode and the boot-blocking secret gates stay off.
 */
export const HOST_DEPLOY_ENV: Readonly<Record<string, string>> = Object.freeze({ TOVU_RUNTIME_MODE: "production" });

/** Where Tovu's agent-plugin overlays live, relative to the repo root (the same cwd convention as
 *  {@link buildDeploymentDescriptor}'s reads). */
const OVERLAYS_DIR = "content/agent-plugin-overlays";

export interface HostDeployNotesPorts {
  /** Overlay root; defaults to `content/agent-plugin-overlays` under `process.cwd()`. */
  readonly overlaysDir?: string;
  /** Reads a file, or returns `undefined` when it does not exist. */
  readonly readFile?: (file: string) => string | undefined;
}

function readOptionalFile(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** The notes array for `targetId`, or a loud error naming the malformed overlay file. */
function hostNotesFor(raw: string, targetId: string, file: string): readonly string[] {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`tovu deploy config: ${file} must map each target id to an array of note strings (target "${targetId}")`);
  }
  const entry = Object.hasOwn(parsed, targetId) ? (parsed as Record<string, unknown>)[targetId] : undefined;
  if (entry === undefined) return [];
  if (!Array.isArray(entry) || !entry.every((note) => typeof note === "string")) {
    throw new Error(`tovu deploy config: ${file} must map each target id to an array of note strings (target "${targetId}")`);
  }
  return entry;
}

/**
 * Appends Tovu's own notes for a deploy target after its plugin generator rendered: the notes in
 * `<overlays>/<plugin>/deploy-notes.json`, keyed by target id (a plugin may contribute several
 * targets). Today that is the headless-Chromium opt-in (owner decision 2026-10-08: the Dockerfile's
 * `TOVU_INSTALL_BROWSER` defaults to 0, so the opt-in has to be stated wherever a host's config is
 * generated); it is Tovu's Dockerfile, so it is Tovu's note, not the vendor plugin's.
 *
 * A note the generator already printed is not repeated: the bundled generators printed these same
 * notes before the cutover to the Jini packages, so the append is safe on both sides of it.
 *
 * @throws {Error} When the overlay's notes file exists but is not valid JSON of that shape.
 * @complexity O(n · m) for n host notes and m rendered notes (both a handful).
 */
export function appendHostDeployNotes(
  { pluginId, targetId, rendered }: { readonly pluginId: string; readonly targetId: string; readonly rendered: RenderedDeployConfig },
  { overlaysDir = join(process.cwd(), OVERLAYS_DIR), readFile = readOptionalFile }: HostDeployNotesPorts = {}
): RenderedDeployConfig {
  // Publisher ids are `tovu/<name>`; overlay folders are named by the plugin's own name.
  const pluginName = pluginId.slice(pluginId.lastIndexOf("/") + 1);
  const file = join(overlaysDir, pluginName, "deploy-notes.json");
  const raw = readFile(file);
  if (raw === undefined) return rendered;
  const extra = hostNotesFor(raw, targetId, file).filter((note) => !rendered.notes.includes(note));
  return extra.length === 0 ? rendered : { ...rendered, notes: [...rendered.notes, ...extra] };
}

/** The kit every generator gets. @complexity O(1). */
export function createDeployConfigKit(): DeployConfigKit {
  return {
    assertNoConfigInjection,
    validationError: (message) => new ValidationError(message),
    migrationsNote: MIGRATIONS_NOTE,
  };
}

/**
 * The secrets every renderer must declare by name.
 *
 * CORRECTION (this pass): an earlier version of this comment claimed this list was "verified
 * against the actual boot-gate code" — that claim was false: `ANALYTICS_ROOT_KEY_SEED` was
 * boot-blocking but absent from `REQUIRED_SECRETS`, so every generated config omitted it and a
 * deployer following one would hit `PRODUCTION_BOOT_UNSAFE_DEFAULT: dev-secret-placeholder` on
 * first boot with no warning from this tool. Fixed below. A false "verified" claim is worse than no
 * claim at all — this comment now enumerates the actual verification, not an assertion of one.
 *
 * CORRECTION (2026-09-09, site-key silent-rekey gap): the citations in this comment
 * used to point at `index.ts:225-234` as "the ONE place that computes all four [checks] for a real
 * boot" — that was already stale when found: the computation was extracted into the shared
 * `runProductionReadinessGateOrExit()` (`server/runtime/boot/boot-readiness-gate.ts`) so both real
 * boot paths (`index.ts` AND `cli/commands/serve.ts`'s `tovu serve`) share one implementation;
 * `index.ts` itself now only calls that function. Citations below point at the real file. Also:
 * `TOVU_SITE_KEY` was "recommended" with NO boot-gate check at all — a container
 * redeploy with the var unset booted fine and silently minted a fresh site key every time
 * (`EnvOrFileKeyring`'s generated-file fallback resolves against the container's ephemeral rootfs,
 * not the persistent volume — `keyring.env.ts`'s own header). Reclassified to "boot-blocking" below,
 * backed by a real gate check (`production-readiness-gate.ts`'s `hasMissingIntegrationsSiteKey`).
 *
 * `production-readiness-gate.ts`'s `collectUnsafeDefaultFailures` reads exactly five `EnvSnapshot`
 * fields; `boot-readiness-gate.ts`'s `runProductionReadinessGateOrExit` is the ONE place that
 * computes all five for a real boot. Enumerated here exhaustively, not just the ones that happened
 * to need an entry:
 *
 * 1. `hasDevSecretPlaceholder` ("dev-secret-placeholder") — `boot-readiness-gate.ts`:
 *    `!process.env.ANALYTICS_ROOT_KEY_SEED`. Boot-blocking, and NAMES A REAL SECRET
 *    (`registerAnalyticsIngestRoute`'s wiring in `app.ts` falls back to the literal dev placeholder
 *    `"dev-only-insecure-seed"` whenever this is unset) — covered by the `ANALYTICS_ROOT_KEY_SEED`
 *    entry below.
 * 2. `hasLocalhostEgressAllowance` ("localhost-egress-allowance") — `boot-readiness-gate.ts`:
 *    hardcoded `false`, unconditionally, for every real boot. That file's own comment on the field
 *    discloses why: `deps.ts` seeds a hardcoded `localhost`/`example.com` origin+egress-allowlist
 *    with no env var escape hatch yet, so this check cannot currently distinguish a real deploy
 *    from a dev one. No env var gates it today — nothing for this list to declare. NOT a secret
 *    this module can surface; flagged here so a future fix to that gap doesn't silently need a
 *    `REQUIRED_SECRETS` update this comment failed to anticipate.
 * 3. `hasAlwaysOnAnalyticsStub` ("always-enabled-analytics-stub") — `boot-readiness-gate.ts`:
 *    hardcoded `false`, unconditionally (ADR-046 Phase 1's analytics slice wired the durable
 *    `SqliteBufferSink` for every composition root). No env var gates it today either — nothing for
 *    this list to declare.
 * 4. `hasDefaultOwnerPassword` ("default-owner-password") — `boot-readiness-gate.ts`:
 *    `(process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD) === DEFAULT_OWNER_PASSWORD`. Boot-
 *    blocking — covered by the `TOVU_ADMIN_PASSWORD` entry below.
 * 5. `hasMissingIntegrationsSiteKey` ("missing-site-key") — `boot-readiness-gate.ts`:
 *    `!process.env.TOVU_SITE_KEY`. Boot-blocking as of this pass — covered by the
 *    `TOVU_SITE_KEY` entry below.
 *
 * So of these five, exactly three are actually env-var-gated today (1, 4, and 5) — all three now
 * have a `REQUIRED_SECRETS` entry; the other two (2 and 3) have no env var to declare, not a gap in
 * this list.
 *
 * Also checked against this repo's own already-reviewed deployment docs, not just `.env.example`
 * (which lists `TOVU_SITE_KEY` alone, under a single undifferentiated "Required"
 * heading that turns out not to match what the code enforces today, though it does match this pass's
 * fix):
 *
 * - `TOVU_ADMIN_PASSWORD` — "boot-blocking". Check 4 above. `docker-compose.yml`'s own "Required"
 *   env block (`${TOVU_ADMIN_PASSWORD:?set TOVU_ADMIN_PASSWORD in .env}`) already draws the
 *   identical line.
 * - `ANALYTICS_ROOT_KEY_SEED` — "boot-blocking". Check 1 above.
 * - `TOVU_SITE_KEY` — "boot-blocking" (as of this pass; was "recommended"). Check 5
 *   above. Before this pass this var was absent entirely from `production-readiness-gate.ts`'s
 *   checks — boot succeeded without it, silently re-keying every redeploy (this file's 2026-09-09
 *   CORRECTION above). Every route needing at-rest secret encryption (the visitor assistant's
 *   provider credential, the newsletter integration) still additionally fails closed with
 *   `503 SECRET_STORE_UNCONFIGURED` at first use if this is ever unset despite the boot gate
 *   (`.env.example`'s own header on this var; `assistant/execution-credential-store.ts:129`) — the
 *   boot-blocking gate is the fix for the SILENT case, not a replacement for that fail-closed
 *   behavior. `docker-compose.yml` used to call this var "Strongly recommended" with a `:-` (empty)
 *   default, distinct from "Required" — updated alongside this pass to the same `:?` hard-fail
 *   `TOVU_ADMIN_PASSWORD` already used there, since it would otherwise now describe a boot that
 *   fails with a compose file that told the operator it wouldn't.
 *
 * - `COMMENTS_IP_SALT` — "recommended" (2026-10-08 hardwiring audit #4). The public comment route
 *   used to fall back to the literal `"dev-only-insecure-salt"` when this was unset, with nothing
 *   asking for it. It now falls back to a salt derived from the site key
 *   (`features/comments/ip-hash-salt.ts`), so boot stays safe without it and the boot gate only
 *   WARNS (`boot-readiness-warnings.ts`). Declared so a deployer pins it: rotating the site key
 *   otherwise changes every commenter's IP hash.
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
  { name: "TOVU_SITE_KEY", requirement: "boot-blocking" },
  { name: "COMMENTS_IP_SALT", requirement: "recommended" },
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
 * Guards a value about to be interpolated, unescaped, into a generated TOML/YAML config file (a
 * hosting plugin's `deploy-configs/*.mjs` that builds its config from a hand-written template
 * string; passed to it in the {@link DeployConfigKit}). A generator that builds its config through
 * `JSON.stringify` is safe by construction and does not need it. Two distinct sink shapes call
 * this, so it covers two distinct hazards:
 *
 * 1. QUOTED sinks (a TOML `key = "${...}"`, or a YAML value after the generator's own allow-list
 *    already passed it). A value containing a double-quote can close the quoted string early; one
 *    also containing a newline can then inject an entirely new top-level key on the next line (the
 *    reproduction and its regression test live with the TOML-emitting plugin's generator).
 * 2. UNQUOTED YAML plain-scalar sinks (`render.mjs`'s `name: ${descriptor.appName}`
 *    and the disk's `name: ${descriptor.volumeName}` — YAML, unlike the TOML sinks above, is
 *    rendered with no surrounding quotes at all). Here a `"`/newline isn't the only hazard: `:`,
 *    `#`, `{`, `[`, `&`, `*`, a leading `-`, or leading/trailing whitespace are each YAML
 *    indicator/structural characters that change what an unquoted plain scalar means (`:` or `#`
 *    can end the scalar and start a new key or a comment mid-line; `{`/`[` open a flow collection;
 *    `&`/`*` are anchor/alias indicators; a leading `-` reads as a block-sequence entry) — the
 *    guard passing these through was this task's bug (then `deploy-config-render.ts:65-78`).
 *
 * Rejecting outright is the reliable fix for both — a per-host region allow-list (the shape
 * `render.mjs`'s `RENDER_VALID_REGIONS` uses) is each generator's own choice, and one host's
 * catalog had no authoritative source to enumerate against (its generator says why);
 * the same reasoning extends to app/volume names here — quoting the two unquoted YAML sinks at
 * render time was considered instead of widening this check, but every renderer's own exact-string
 * golden test already pins the CURRENT unquoted rendering for a safe name (e.g.
 * `bundled-deploy-config-render.unit.test.ts`'s `name: acme-app`), so unconditionally quoting would change
 * output for every already-safe app/volume name, not just unsafe ones — a real caller-visible
 * behavior change this task's own instructions rule out. Widening the reject-list here instead never
 * changes what an already-accepted value renders as; it only ever accepts fewer values, which is
 * exactly the tradeoff already made for `"`/newline above.
 */
/** QUOTED-sink hazard chars (hazard 1 in this function's own doc) — a bare array + `.some()` so
 *  this predicate carries zero branches of its own; the ceiling this whole extraction exists to
 *  clear applies per-FUNCTION, and a 3-character alternation hand-written as `||` chains was most
 *  of {@link assertNoConfigInjection}'s prior complexity. */
const QUOTE_OR_NEWLINE_CHARS = ['"', "\n", "\r"] as const;

/** UNQUOTED-YAML-plain-scalar indicator/structural chars (hazard 2 in this function's own doc). */
const YAML_SIGNIFICANT_CHARS = [":", "#", "{", "[", "&", "*"] as const;

function containsAnyOf(value: string, chars: readonly string[]): boolean {
  return chars.some((char) => value.includes(char));
}

function hasLeadingHyphenOrSurroundingWhitespace(value: string): boolean {
  return value.startsWith("-") || value !== value.trim();
}

export function assertNoConfigInjection(fieldLabel: string, value: string): void {
  if (containsAnyOf(value, QUOTE_OR_NEWLINE_CHARS)) {
    throw new ValidationError(`${fieldLabel} (${JSON.stringify(value)}) contains a quote or newline character, which would corrupt the generated config file`);
  }
  if (containsAnyOf(value, YAML_SIGNIFICANT_CHARS)) {
    throw new ValidationError(
      `${fieldLabel} (${JSON.stringify(value)}) contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file`
    );
  }
  if (hasLeadingHyphenOrSurroundingWhitespace(value)) {
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
 * @complexity O(n) in the total source text — three reads and fixed extraction passes.
 */
export function buildDeploymentDescriptor(): DeploymentDescriptor {
  const dockerfile = readRepoFile("Dockerfile");
  const packageJson = readRepoFile("package.json");
  const healthRouteSource = readRepoFile("apps/website/src/server/inbound/public-http/routes/ops/health.ts");

  const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port", "Dockerfile (EXPOSE line)"));
  const dockerfilePath = "Dockerfile";
  const appName = extractOrThrow(packageJson, /^[^\S\r\n\u2028\u2029]*"name"\s*:\s*"([^"]+)"/mu, "the default app name", "package.json (name)");
  const volumeName = `${appName}_sites`;
  const volumeMountPath = extractOrThrow(
    dockerfile,
    /^VOLUME\s+\["([^"]+)"\]\s*$/m,
    "the volume mount path",
    "Dockerfile (VOLUME line)"
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
