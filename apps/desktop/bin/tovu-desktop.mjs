#!/usr/bin/env node
/**
 * @file `tovu-desktop` — the desktop shell's own small CLI. Today it has one command, `add-site`,
 * which points the app at a Tovu website that already exists on disk.
 *
 * ## Why this lives in `apps/desktop` rather than extending `tovu adopt`
 *
 * `apps/website/src/cli/commands/adopt.ts` is a different tool with a similar name: it REPAIRS a
 * site whose `content.db` is missing the marker pair, and it is owned by `apps/website`. Teaching it
 * about `desktop-projects.json` would make `apps/website` depend on `apps/desktop`, inverting the
 * one structural rule this directory has — `apps/desktop` is a consumer of Tovu's published
 * contracts and can be deleted in place without anything else changing. So the command lives here,
 * and it is cheap to have here: `tracked-sites.js` and `site-dir-store.js`'s classifier are
 * already `electron`-free and run under plain Node.
 *
 * ## One implementation, three entry points
 *
 * This command, the `add_site_pointer` MCP tool (`projects-mcp-tools.js`) and the Projects header
 * button (IPC, `project-ipc.js`) all call `addSitePointer` and nothing else. None of them re-decides
 * what a site is, what gets written, or what an empty folder means — so the three cannot drift into
 * disagreeing, which is how "the button accepted it but the CLI didn't" bugs are born.
 *
 * Exit codes are meaningful, because a CLI's caller is often a script: `0` added or already present,
 * `1` a refusal the operator can fix (wrong path, not a site), `2` a usage error.
 */
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AddSitePointerError, addSitePointer } from "../src/add-site-pointer.js";
import { sitesFilePath } from "../src/tracked-sites.js";
import { resolveDesktopUserDataDir } from "../src/desktop-user-data-dir.js";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

const USAGE = `tovu-desktop — point the Tovu desktop app at your existing websites

Usage:
  tovu-desktop add-site <path-to-site-folder>

  add-site   Add a Tovu website that already exists to the app's list of websites.
             The folder is only pointed at: nothing is moved, copied, or created,
             and a folder that is not already a complete Tovu site is refused.

Options:
  --user-data-dir <path>   Use this app-data directory instead of the default.
                           (Same meaning as TOVU_DESKTOP_USER_DATA_DIR.)
  -h, --help               Show this message.
`;

/**
 * Pull `--user-data-dir <path>` out of argv, returning it and the remaining positional arguments.
 *
 * Hand-parsed rather than pulled from a library, because this directory ships no CLI dependency and
 * one flag does not justify adding the first one.
 *
 * @complexity O(n) in argv length.
 */
function parseArgv(argv) {
  const positional = [];
  let userDataDir;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--user-data-dir") {
      userDataDir = argv[index + 1];
      index += 1;
      continue;
    }
    positional.push(argv[index]);
  }
  return { positional, userDataDir };
}

/**
 * Resolve the app-data directory, and say out loud which one is being used.
 *
 * The directory is ANNOUNCED on every run, not only on failure, and that is the mitigation for this
 * CLI's one structural risk: `resolveDesktopUserDataDir` mirrors Electron's convention rather than
 * asking Electron, so a drift would otherwise show up as a row written somewhere the app never
 * looks — a silent no-op. Printing it turns that into something the operator can see and correct
 * with `--user-data-dir`.
 *
 * A directory that does not exist yet is reported rather than treated as an error: someone can
 * reasonably add a site before ever launching the app, and `trackSite` creates the directory.
 * But it is the single likeliest sign the path is wrong, so it is said plainly.
 *
 * @complexity O(1).
 */
function resolveAnnouncedUserDataDir(override, log) {
  const userDataDir = override?.trim() ? path.resolve(override.trim()) : resolveDesktopUserDataDir();
  log(`Using app data: ${userDataDir}`);
  if (!fs.existsSync(userDataDir)) {
    log("  (this directory does not exist yet — it will be created. If the Tovu app is already");
    log("   installed and running, check the path above and pass --user-data-dir if it is wrong.)");
  }
  return userDataDir;
}

/**
 * `add-site` — the whole command.
 *
 * @returns an exit code.
 * @complexity O(n) in the tracked-row count, plus one classification.
 */
function runAddSite(positional, userDataDirOverride, io) {
  const [rawSiteDir, ...extra] = positional;
  if (rawSiteDir === undefined) {
    io.err("add-site needs the path to a site folder.\n");
    io.err(USAGE);
    return EXIT_USAGE;
  }
  if (extra.length > 0) {
    // Refused rather than ignored: an unquoted path with a space arrives as several arguments, and
    // silently adding only the first one would point the app at a folder the operator did not name.
    io.err(`add-site takes one path, but got ${positional.length}: ${positional.join(" ")}\n`);
    io.err("If the path contains spaces, quote it.\n");
    return EXIT_USAGE;
  }

  const userDataDir = resolveAnnouncedUserDataDir(userDataDirOverride, io.out);

  try {
    const result = addSitePointer({ siteDir: rawSiteDir, projectsPath: sitesFilePath(userDataDir) });
    io.out(describeAddSiteResult(result));
    return EXIT_OK;
  } catch (err) {
    if (err instanceof AddSitePointerError) {
      io.err(`${err.message}\n`);
      return EXIT_REFUSED;
    }
    throw err;
  }
}

/** The operator-facing outcome line. @complexity O(1). */
function describeAddSiteResult(result) {
  if (result.alreadyTracked) return `Already in your websites: ${result.siteDir}\nNothing changed.\n`;
  const restored = result.alreadyDismissed ? "\nYou had removed this website before; adding it by name brings it back.\n" : "\n";
  return `Added: ${result.siteDir}\nThe folder was not moved, copied, or changed.${restored}`;
}

/**
 * Dispatch one invocation.
 *
 * `io` is injected so the whole CLI is assertable from `node --test` — output and exit code both —
 * without capturing the real `process.stdout` or letting a test exit the runner.
 *
 * @returns an exit code.
 * @complexity O(1) beyond the dispatched command's own cost.
 */
function runTovuDesktopCli(argv, io) {
  const { positional, userDataDir } = parseArgv(argv);
  const [command, ...rest] = positional;

  if (command === undefined || command === "-h" || command === "--help" || command === "help") {
    io.out(USAGE);
    return command === undefined ? EXIT_USAGE : EXIT_OK;
  }
  if (command === "add-site") return runAddSite(rest, userDataDir, io);

  io.err(`Unknown command '${command}'.\n\n`);
  io.err(USAGE);
  return EXIT_USAGE;
}

/** Run only as the process, never on import — see `bin/mcp-bridge.mjs`'s identical guard. */
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runTovuDesktopCli(process.argv.slice(2), {
    out: (text) => process.stdout.write(text.endsWith("\n") ? text : `${text}\n`),
    err: (text) => process.stderr.write(text),
  });
}

export { EXIT_OK, EXIT_REFUSED, EXIT_USAGE, USAGE, parseArgv, runTovuDesktopCli };
