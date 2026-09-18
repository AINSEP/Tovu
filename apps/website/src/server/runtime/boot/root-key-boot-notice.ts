import { inspectRootKeyMaterial, type RootKeyStatus } from "#src/features/webhooks/keyring.env";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";

/**
 * @file The LOCAL-mode counterpart to `runProductionReadinessGateOrExit()`: a server booted with
 * no usable integrations root key says so, once, on its own terminal.
 *
 * ## Why local mode had nothing
 *
 * `boot-readiness-gate.ts` already refuses to boot in PRODUCTION when
 * `inspectRootKeyMaterial().active` is false. In local mode it returns immediately, which is
 * correct — a developer machine must be able to boot without a key, and refusing would be
 * unrecoverable (the admin Secrets page that generates one lives behind this very boot). But
 * "don't refuse" was implemented as "don't mention it", and that silence is the defect.
 *
 * 2026-09-18: the desktop shell was launched with `electron .` from `apps/desktop` instead of
 * `npm run desktop` from the repo root, so `.env` was never loaded and every site server it
 * spawned inherited an environment with no key. Listing credentials and editing content worked
 * fine. Hours later a Fly deploy failed with an opaque `500 INTERNAL_ERROR` from
 * `custom_credential_make_request`, and an agent spent a long time chasing a network fault that
 * did not exist. The real cause was one line in a daemon log, produced at USE time, that nobody
 * was reading.
 *
 * The desktop shell now detects this in its own process and shows a banner
 * (`apps/desktop/src/root-key-boot-guard.ts`). This function is the same detection for the OTHER
 * launcher — `npm run dev`, and a packaged `tovu serve` — where there is no shell to put a banner
 * in. It is a log line, and a log line is admittedly the weaker surface; its job is to be at BOOT,
 * beside everything else a developer reads while a server starts, rather than hours later beside a
 * failing request.
 *
 * ## What it does not do
 *
 * Never throws, never exits, never changes what boots. A missing key is recoverable and the app is
 * what recovers it. And it never reads or prints key material — {@link RootKeyStatus} carries a
 * one-way fingerprint at most, and this file only ever reads its boolean and path fields.
 */

/** The reader and the writer, injected so this is testable without a real environment, a real
 *  `~/.tovu`, or a captured console. */
export interface RootKeyBootNoticeDeps {
  /** Defaults to `inspectRootKeyMaterial` — the SAME function the admin Secrets page reports and
   *  the production gate checks, so these three can never disagree about what "has a key" means. */
  inspect?: () => RootKeyStatus;
  /** Defaults to `resolveRuntimeMode`. */
  mode?: () => "production" | "local";
  /** Defaults to `console.warn`. One call per line. */
  log?: (line: string) => void;
}

/**
 * Warns on this server's terminal when it booted without usable root-key material.
 *
 * Call from a top-level boot path, next to `runProductionReadinessGateOrExit()`. Inert in
 * production, where that gate has already refused to boot at all for this exact condition —
 * running both would print a warning immediately before an exit.
 *
 * @throws never. A probe that fails is reported as "cannot tell", not propagated onto the boot path.
 * @complexity O(1) plus at most one small file read inside `inspect`.
 */
export function warnIfNoRootKeyAtBoot(deps: RootKeyBootNoticeDeps = {}): void {
  const mode = (deps.mode ?? resolveRuntimeMode)();
  if (mode === "production") return;

  const log = deps.log ?? ((line: string) => console.warn(line));
  let status: RootKeyStatus;
  try {
    status = (deps.inspect ?? inspectRootKeyMaterial)();
  } catch {
    // Reported rather than rethrown: this runs on the boot path, and "I could not check" is still
    // worth saying out loud — it is the same class of surprise as "there is no key".
    safely(log, ["[root-key] could not determine whether this server has usable root-key material."]);
    return;
  }
  if (status.active) return;

  safely(log, rootKeyBootNoticeLines(status));
}

/** Writes the notice, tolerating a sink that throws — a dead stderr must not take the boot down. */
function safely(log: (line: string) => void, lines: readonly string[]): void {
  try {
    for (const line of lines) log(line);
  } catch {
    /* nothing here is worth failing a boot over */
  }
}

/**
 * The warning, as lines. Exported for its test, and separate from the emitter so the wording is
 * assertable without capturing a console.
 *
 * Every path and variable name is read from the STATUS, so this can never name a different file
 * than the one that was actually checked. Nothing here reads key material.
 */
export function rootKeyBootNoticeLines(status: RootKeyStatus): readonly string[] {
  const cause = status.invalid
    ? `the ${status.source === "env" ? "TOVU_INTEGRATIONS_ROOT_KEY environment variable" : `key file at ${status.keyFilePath}`} is present but not usable (${status.reason ?? "unreadable"})`
    : `TOVU_INTEGRATIONS_ROOT_KEY is not set and there is no key file at ${status.keyFilePath}`;

  return [
    "",
    "  ⚠  THIS SERVER HAS NO USABLE ROOT KEY",
    `     ${cause}.`,
    "",
    "     It will serve pages and list credentials normally. Anything that READS a stored",
    "     credential — a deploy, a saved API key, a custom credential request — will fail,",
    "     far from this cause.",
    "",
    "     If this was started by the desktop app: quit it and relaunch with `npm run desktop`",
    "     from the REPO ROOT. Only that launcher loads the repo's .env; `electron .` inside",
    "     apps/desktop does not.",
    "     If this is `npm run dev`: that launcher DOES load .env — check the file actually",
    "     defines TOVU_INTEGRATIONS_ROOT_KEY.",
    `     Otherwise set TOVU_INTEGRATIONS_ROOT_KEY, or generate a key file at ${status.keyFilePath}`,
    "     from the admin Secrets page (Site Token tab, Generate).",
    "",
    "     Credentials already stored are sealed under whatever key was in place when they were",
    "     saved. Generating a new key will not recover them.",
    "",
  ];
}
