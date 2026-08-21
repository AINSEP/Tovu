/**
 * @file The CLI an operator actually types to install one Agent Plugin from a URL: download, verify,
 * extract into this Tovu instance's own per-workspace package store. Thin composition over
 * `fetchAgentPluginArchive` (`--print-digest` only) and `installAgentPluginFromUrl` — no hardening
 * logic of its own; every guarantee (digest verification, zip-slip, decompression caps, tenant
 * isolation) lives in `src/features/agent-plugins/` and is exercised unchanged here.
 *
 * Usage:
 *   npx tsx development/scripts/install-agent-plugin.ts <url> --print-digest
 *   npx tsx development/scripts/install-agent-plugin.ts <url> --workspace <uuid> --sha256 <hex>
 *   npx tsx development/scripts/install-agent-plugin.ts <url> --workspace <uuid> --trust-first-use
 *
 * `--print-digest` downloads and prints the archive's SHA-256 without installing anything — the
 * normal way to obtain a first `--sha256` value to pin.
 *
 * Exactly one of `--sha256 <hex>` / `--trust-first-use` is required for a real install. This is a
 * forced, explicit choice rather than a default (see `install-from-url.ts`'s own header for why
 * `AgentPluginIntegrity` is a tagged union): silently hashing whatever the URL happens to serve today
 * and calling that "verified" would defeat the whole point of a digest check. Passing neither refuses
 * to run and says exactly which flag to add.
 */
import {
  AgentPluginFetchError,
  fetchAgentPluginArchive,
} from "../../src/features/agent-plugins/fetch-archive.js";
import { AgentPluginInstallError } from "../../src/features/agent-plugins/install.js";
import {
  installAgentPluginFromUrl,
  type AgentPluginIntegrity,
} from "../../src/features/agent-plugins/install-from-url.js";
import { resolveAgentPluginLayout } from "../../src/features/agent-plugins/layout.js";

const USAGE =
  "Usage: npx tsx development/scripts/install-agent-plugin.ts <url> --print-digest\n" +
  "   or: npx tsx development/scripts/install-agent-plugin.ts <url> --workspace <uuid> --sha256 <hex>\n" +
  "   or: npx tsx development/scripts/install-agent-plugin.ts <url> --workspace <uuid> --trust-first-use";

interface RawArgs {
  readonly positional: readonly string[];
  readonly workspace: string | undefined;
  readonly sha256: string | undefined;
  readonly trustFirstUse: boolean;
  readonly printDigest: boolean;
}

/** Pure token classification — no validation, no exit calls, so it stays directly testable in
 * isolation from {@link parseArgs}'s own "is this a legal combination" rules. */
function parseRawArgs(args: readonly string[]): RawArgs {
  const positional: string[] = [];
  let workspace: string | undefined;
  let sha256: string | undefined;
  let trustFirstUse = false;
  let printDigest = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === "--workspace") {
      workspace = args[++i];
    } else if (arg === "--sha256") {
      sha256 = args[++i];
    } else if (arg === "--trust-first-use") {
      trustFirstUse = true;
    } else if (arg === "--print-digest") {
      printDigest = true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, workspace, sha256, trustFirstUse, printDigest };
}

type ParsedArgs =
  | { readonly mode: "print-digest"; readonly url: string }
  | { readonly mode: "install"; readonly url: string; readonly workspaceId: string; readonly integrity: AgentPluginIntegrity };

function printUsageAndExit(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

/**
 * Validates the raw token classification into one of exactly two legal shapes: a digest-only probe,
 * or a full install with an explicit integrity decision. Every illegal combination (missing url,
 * missing workspace, both/neither of `--sha256`/`--trust-first-use`) exits with a message naming the
 * exact flag to add — never a generic "invalid arguments".
 */
function parseArgs(argv: readonly string[]): ParsedArgs {
  const raw = parseRawArgs(argv.slice(2));
  const url = raw.positional[0];
  if (url === undefined) printUsageAndExit("Missing required <url>.");

  if (raw.printDigest) return { mode: "print-digest", url };

  if (raw.workspace === undefined) printUsageAndExit("Missing required --workspace <uuid>.");
  if (raw.sha256 !== undefined && raw.trustFirstUse) {
    printUsageAndExit("Pass exactly one of --sha256 <hex> or --trust-first-use, not both.");
  }
  if (raw.sha256 === undefined && !raw.trustFirstUse) {
    printUsageAndExit(
      "Refusing to install without an integrity decision: add --sha256 <hex> (run with --print-digest first " +
        "to get one) for a verified install, or --trust-first-use to install whatever this URL currently " +
        "serves, unverified.",
    );
  }

  const integrity: AgentPluginIntegrity =
    raw.sha256 !== undefined ? { kind: "pinned", sha256: raw.sha256 } : { kind: "trust-on-first-use" };
  return { mode: "install", url, workspaceId: raw.workspace, integrity };
}

async function runPrintDigest(url: string): Promise<void> {
  const { sha256, resolvedUrl } = await fetchAgentPluginArchive({ url });
  console.log(`resolvedUrl: ${resolvedUrl}`);
  console.log(`sha256:      ${sha256}`);
  console.log(`\nNothing installed. Pin this digest with: --sha256 ${sha256}`);
}

async function runInstall(args: Extract<ParsedArgs, { mode: "install" }>): Promise<void> {
  const layout = resolveAgentPluginLayout();
  const result = await installAgentPluginFromUrl({
    url: args.url,
    integrity: args.integrity,
    layout,
    workspaceId: args.workspaceId,
  });

  console.log(`resolvedUrl:     ${result.resolvedUrl}`);
  console.log(`sha256:          ${result.sha256}`);
  console.log(`digestWasPinned: ${result.digestWasPinned}`);
  console.log(`packageRoot:     ${result.installed.packageRoot}`);
  console.log(`pluginId:        ${result.installed.pluginId}${result.installed.version ? ` @ ${result.installed.version}` : ""}`);
  console.log(
    `skills:          ${result.installed.skills.length === 0 ? "(none)" : result.installed.skills.map((s) => s.name).join(", ")}`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  try {
    if (args.mode === "print-digest") {
      await runPrintDigest(args.url);
    } else {
      await runInstall(args);
    }
  } catch (error) {
    if (error instanceof AgentPluginFetchError) {
      console.error(`DOWNLOAD FAILED [${error.code}]: ${error.message}`);
      process.exit(1);
    }
    if (error instanceof AgentPluginInstallError) {
      console.error(`INSTALL FAILED [${error.code}]: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

void main();
