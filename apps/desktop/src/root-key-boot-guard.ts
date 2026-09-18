/**
 * @file The shell's boot-time root-key check: one read at startup, a loud terminal warning when
 * nothing usable is configured, and the same verdict served to the renderer so a person actually
 * sees it.
 *
 * ## The defect this removes
 *
 * 2026-09-18: the app was launched with `electron .` from `apps/desktop` instead of
 * `npm run desktop` from the repo root. Only the repo-root launcher runs
 * `development/scripts/dev-desktop.mjs` → `loadRepoRootEnvFile`, so `.env` was never read and
 * `TOVU_INTEGRATIONS_ROOT_KEY` was unset for the shell and for every site server it spawned (those
 * inherit `process.env`). Listing credentials and editing content kept working. The first symptom
 * arrived hours later, on a Fly deploy, as `500 INTERNAL_ERROR` from
 * `custom_credential_make_request`, and the only honest statement of the cause was a line in a
 * daemon log nobody was tailing. `ec3cb847` since made that error legible — but only once you hit
 * it. Nothing announced it.
 *
 * ## The two rules that shape this module
 *
 * **Boot, not first use.** {@link installRootKeyBootGuard} reads the environment immediately and
 * serves that SNAPSHOT for the rest of the process's life. Checking lazily inside the IPC handler
 * would reintroduce exactly the delay this exists to remove, and would also let the warning
 * silently clear itself if a key appeared later — while every site server already spawned still
 * carries the empty environment it was started with.
 *
 * **Loud, not closed.** A missing key is recoverable, and the operator needs a running app to go
 * fix it (the admin Secrets page can generate one). So nothing here throws, exits, or blocks: a
 * failing probe and even a failing log sink both degrade to "report a missing key and carry on".
 *
 * ## Secrets
 *
 * Neither the log nor the IPC payload can carry key material — see {@link RootKeyBootStatus},
 * which has no field for it, and the warning builder below, which reads only the status.
 */
import { ROOT_KEY_CHANNELS } from "./contracts/root-key.ts";
import { inspectRootKeyForBoot, type RootKeyBootStatus, type RootKeyRejection } from "./root-key-status.ts";

/** Everything the guard touches, injected so the whole module is testable under plain `node --test`
 *  with no Electron, no console and no filesystem. */
export interface RootKeyBootGuardDeps {
  /** Electron's `ipcMain`, narrowed to the one method used. */
  ipcMain: { handle(channel: string, listener: () => unknown): void };
  /** Defaults to the real environment probe. */
  inspect?: () => RootKeyBootStatus;
  /** Defaults to `console.warn`. One call per line. */
  log?: (line: string) => void;
}

/**
 * Takes the boot snapshot, warns if it is bad, and registers the renderer's read-only view of it.
 *
 * Call once, from the shell's boot path, BEFORE the first window opens — the renderer's banner
 * fetches this on mount, and a window that opened first would race an unregistered channel.
 *
 * @returns the boot snapshot, so the caller can act on it without probing a second time.
 * @throws never — deliberately. See this file's header.
 * @complexity O(1) plus one small file read inside `inspect`.
 */
export function installRootKeyBootGuard(deps: RootKeyBootGuardDeps): RootKeyBootStatus {
  const snapshot = takeSnapshot(deps.inspect ?? (() => inspectRootKeyForBoot()));
  if (!snapshot.present) {
    // `console.warn`, not `error`: this is a condition to fix, not a failure that stopped anything.
    emit(deps.log ?? ((line: string) => console.warn(line)), rootKeyBootWarningLines(snapshot));
  }
  deps.ipcMain.handle(ROOT_KEY_CHANNELS.status, () => snapshot);
  return snapshot;
}

/** The probe, wrapped so a filesystem or environment fault at boot becomes a reported missing key
 *  rather than an unhandled rejection on the app's startup path. */
function takeSnapshot(inspect: () => RootKeyBootStatus): RootKeyBootStatus {
  try {
    return inspect();
  } catch {
    return {
      present: false,
      source: "none",
      invalid: true,
      reason: "unreadable",
      keyFilePath: "(could not be determined — the root-key check itself failed)",
      envVarName: "TOVU_INTEGRATIONS_ROOT_KEY",
    };
  }
}

/** Writes the warning, tolerating a sink that throws. A dead stderr must not cost the operator the
 *  in-app banner, which is the surface that actually works. */
function emit(log: (line: string) => void, lines: readonly string[]): void {
  try {
    for (const line of lines) log(line);
  } catch {
    /* the banner is the surface that matters; a broken log sink is not worth a crash */
  }
}

/** Plain-language "what is wrong with the material that IS there", per rejection. A `Record` over
 *  the union, so a new rejection reason without a sentence is a compile error. */
const REJECTION_SENTENCE: Record<RootKeyRejection, string> = {
  empty: "it is empty",
  "not-hex": "it contains characters that are not hex digits",
  "odd-length": "it has an odd number of hex digits, so it does not describe whole bytes",
  "too-short": "it is too short — a root key must be at least 32 bytes (64 hex digits)",
  unreadable: "it could not be read",
};

/**
 * The terminal warning, as lines. Exported for its test, and kept separate from the emitter so the
 * wording is assertable without capturing a console.
 *
 * Every line is derived from the status — the env var name and key file path come from the probe,
 * never from a literal repeated here — so this text cannot name a different file than the one the
 * check actually looked at. No branch reads or prints key material.
 */
export function rootKeyBootWarningLines(status: RootKeyBootStatus): readonly string[] {
  const cause = status.invalid
    ? `The ${status.source === "env" ? `${status.envVarName} environment variable` : `root key file at ${status.keyFilePath}`} is not usable: ${REJECTION_SENTENCE[status.reason ?? "unreadable"]}.`
    : `No root key is configured: ${status.envVarName} is not set, and there is no key file at ${status.keyFilePath}.`;

  return [
    "",
    "  ┌──────────────────────────────────────────────────────────────────────────────",
    "  │  TOVU HAS NO USABLE ROOT KEY",
    "  │",
    `  │  ${cause}`,
    "  │",
    "  │  Everything will look normal until the first action that needs a stored",
    "  │  credential — deploying, calling a saved API, a custom credential request.",
    "  │  Those will fail, and they will fail a long way from this cause.",
    "  │",
    "  │  Most likely: this app was launched in a way that never reads the repo's .env.",
    "  │  Quit, and start it with:",
    "  │",
    "  │      npm run desktop        (from the REPO ROOT, not from apps/desktop)",
    "  │",
    "  │  `npm run dev` inside apps/desktop is plain `electron .` — it does not load .env.",
    "  │",
    "  │  Or fix it directly, either way:",
    `  │    • set ${status.envVarName} in the environment this app is launched from, or`,
    `  │    • generate a key file at ${status.keyFilePath}`,
    "  │      (the admin Secrets page → Site Token tab → Generate).",
    "  │",
    "  │  Credentials already stored are sealed under whatever key was in place when they",
    "  │  were saved. Generating a NEW key does not recover them.",
    "  └──────────────────────────────────────────────────────────────────────────────",
    "",
  ];
}
