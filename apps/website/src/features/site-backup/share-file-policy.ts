import { createHash } from "node:crypto";
import { checkTreePath } from "../publish-content/file-tree-policy.js";
import { SiteShareRefusal, SHARE_LIMITS, addShareOmission, archiveRefusalName } from "./share-policy.js";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";

/** The seven-segment root of an installed plugin package payload (matched against the lowercased path). */
const PACKAGE_CONTENT_ROOT = /^agent-plugins\/ws\/[^/]+\/[^/]+\/package\/sha256\/[a-f0-9]{64}\//;
/** The same root, capturing its archive digest and the package-relative path below it. */
const PACKAGE_FILE = /^agent-plugins\/ws\/[^/]+\/[^/]+\/package\/sha256\/([a-f0-9]{64})\/(.+)$/i;
/** Names an installed package ships as content (MCP declarations, credential schemes), never runtime secrets. */
const PACKAGE_MANIFEST_NAMES = ["mcp.json", "tovu-credential-schemes.json"];

/** Archive digest -> (package-relative path -> SHA-256 of the bytes) for every package THIS build
 *  ships (`package-file-inventory.ts`). The only proof a package-shaped path is the installer's. */
export type PackageFileInventory = ReadonlyMap<string, ReadonlyMap<string, string>>;

/** The plugin memory a share carries. Every other folder under a plugin's `memory/` is private runtime
 *  state: export excludes it ({@link excludedSharePath}) and import refuses it (`archive-manifest.ts`). */
export const SHARED_PLUGIN_MEMORY = String.raw`memory\/(?:notes|learned)`;
const PRIVATE_PLUGIN_MEMORY = String.raw`memory\/(?!(?:notes|learned)(?:\/|$))`;
const AGENT_PLUGIN_RUNTIME = new RegExp(String.raw`^agent-plugins\/ws\/[^/]+\/[^/]+\/(?:data(?:\/|$)|${PRIVATE_PLUGIN_MEMORY})`);

function excludedRuntimeSharePath({ path, parts }: { path: string; parts: string[] }, _options = {}): boolean {
  // Plugin runtime data/memory have fixed roots. A package's src/data or docs/notes is content.
  // A site plugin needs no rule here: the share walks only the files Jini lists as its package
  // (`sources.ts` walkSitePlugins), so its data/ and private memory are never reached.
  const roots = [
    /^agent-plugins\/ws\/[^/]+\/(?:data|staging)(?:\/|$)/,
    AGENT_PLUGIN_RUNTIME,
    /^uploads\/chat-attachments(?:\/|$)/,
  ];
  return roots.some(root => root.test(path)) ||
    parts.some(part => part.startsWith(".env") || /^chat\.db(?:$|[.-])/.test(part));
}

/** A name that only hints at a secret; below a package root the file's bytes decide (see requireShareSecretFree). */
const CREDENTIAL_NAME = /(?:credential|vault|keyring|site-key|private[-_]?key)/;

/** Non-credential private/runtime names that still refuse; credential names are omitted by
 * {@link secretSharePath}, which runs first. */
function suspiciousSharePart({ part }: { part: string }, _options = {}): boolean {
  const names = [".git", "node_modules", ".publish-staging", ".publish-previous", ".ds_store", "_share", ".fs-custom-root.json"];
  const prefixes = [".share-", "restore-point-", "superseded-"];
  return names.includes(part) || prefixes.some(prefix => part.startsWith(prefix)) || /\.(?:db|sqlite|sqlite3)(?:$|[.-])/.test(part);
}

/** Credential names are omissions; traversal and containment remain validation errors.
 * Package manifests and credential labels are public package metadata, not runtime stores.
 */
export function secretSharePath(required: { path: string }, { packageContent = false } = {}): boolean {
  if (redactSecretShapes({ text: required.path }, { vendorOnly: true }).redactions > 0) return true;
  const p = required.path.toLowerCase();
  const root = PACKAGE_CONTENT_ROOT.test(p);
  return p.split("/").some((part, index) => {
    const inPackage = root && index >= 7;
    if (inPackage && PACKAGE_MANIFEST_NAMES.includes(part)) return false;
    // A package's credential LABEL name is allowed; key-file rules (.pem, id_rsa…) still apply.
    return credentialFileName({ part }, { credentialNameAllowed: inPackage && packageContent });
  });
}

/** Fixed name rules are independent of path containment and package execution trust. */
function credentialFileName(required: { part: string }, { credentialNameAllowed = false } = {}): boolean {
  const rules = [/^\.env/, /^\.(?:npmrc|netrc|storage-secret\.json)$/, /^mcp\.json$/,
    /^\.mcp(?:\..*)?\.json$/, /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/, /\.(?:pem|key|p12|pfx)(?:[.-]|$)/];
  return (!credentialNameAllowed && CREDENTIAL_NAME.test(required.part)) || rules.some(rule => rule.test(required.part));
}

/** Excludes private runtime trees and credential-like paths, reporting safe omission locations. */
export function excludedSharePath(required: { path: string }, optional: { notices?: string[] } = {}): boolean {
  const p = required.path.toLowerCase(), packageRoot = PACKAGE_CONTENT_ROOT.test(p);
  if (secretSharePath(required, { packageContent: packageRoot })) {
    if (optional.notices) addShareOmission({ notices: optional.notices, location: required.path });
    return true;
  }
  if (excludedRuntimeSharePath({ path: p, parts: p.split("/") })) return true;
  const unsafe = p.split("/").some((part, index) => {
    if (packageRoot && index >= 7 && PACKAGE_MANIFEST_NAMES.includes(part)) return false;
    return suspiciousSharePart({ part });
  });
  if (unsafe) {
    throw new SiteShareRefusal({ code: "UNSAFE_FILE", message: `Share refuses suspicious required path '${archiveRefusalName({ name: required.path })}'. Remove it before sharing.` });
  }
  return false;
}

/**
 * True only when this build ships these exact bytes at this package-relative path under this digest.
 * Anyone who can write into the site folder can create a package-SHAPED path, and install records
 * live in that same folder, so the shape, the folder name and the ledger prove nothing; the build's
 * own bundled sources do. An operator-installed package, a superseded digest, an unlisted file under a
 * verified root, or a tampered file all get the ordinary EXPORT rules. Import independently
 * classifies known bundled ids because another build's package digest can legitimately differ. O(bytes).
 */
function verifiedPackageFile(required: { path: string; bytes: Uint8Array }, optional: { packageFiles?: PackageFileInventory }): boolean {
  const match = PACKAGE_FILE.exec(required.path);
  if (!match) return false;
  // The root: a digest this build ships. The file: listed below that root, with the same bytes.
  const shipped = optional.packageFiles?.get(match[1]!.toLowerCase());
  const expected = shipped?.get(match[2]!);
  return expected !== undefined && createHash("sha256").update(required.bytes).digest("hex") === expected;
}

/** Both archive directions classify known bundled roots independently of their source-build digest.
 * The caller supplies ids from the receiving build; plugin memory and unknown ids stay strict.
 * @complexity O(path); no I/O or trust/activation changes.
 */
function bundledImportPackage(required: { path: string }, optional: { bundledImportPluginIds?: ReadonlySet<string> }): boolean {
  return PACKAGE_CONTENT_ROOT.test(required.path.toLowerCase()) && optional.bundledImportPluginIds?.has(required.path.split("/")[3]!) === true;
}

/** True for a spelling some supported recipient filesystem rejects, rewrites or aliases. O(path). */
function hasUnportableSpelling(required: { path: string }): boolean {
  const p = required.path;
  const parts = p.split("/");
  if (/[:%\x00-\x1f\x7f\\]/.test(p) || p.normalize("NFC") !== p || p.normalize("NFKC") !== p || /[<>"|?*]/.test(p)) return true;
  return parts.some(part => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) ||
    parts.length > SHARE_LIMITS.maxPathSegments || parts.some(part => /[. ]$/.test(part));
}

/** A ZIP path has one canonical spelling on every supported recipient filesystem. O(path). */
export function validateSharePath(required: { path: string }, _optional: Record<string, never> = {}): void {
  const p = required.path;
  // This one exact path is produced by trusted projection, never by a filesystem walk.
  // The publish owner mixes secret names with path-shape checks. Mask only names destined
  // for omission, retaining separators, dot segments and length for its structural checks.
  const structural = p.split("/").map(part => secretSharePath({ path: part }) ? "x".repeat(part.length) : part).join("/");
  const reason = ["database/content.db", "content.db"].includes(p) ? null : checkTreePath(structural);
  if (reason || hasUnportableSpelling({ path: p })) {
    const shownPath = archiveRefusalName({ name: p });
    // A callback treats archive '$&'/'$`' spellings as text, never replacement tokens.
    const suffix = reason ? `: ${reason.replaceAll(structural, () => shownPath)}` : ".";
    throw new SiteShareRefusal({ code: "UNSAFE_PATH", message: `Share path '${shownPath}' is unsafe${suffix}` });
  }
}

/** Decide inclusion from complete bytes; omit a suspicious file whole, with a safe notice. O(bytes).
 * `path` picks the rules; notices use `shownPath` when given (the archive path the owner can find,
 * not the synthetic scan path `archiveSecretScanPath` builds). */
export function requireShareSecretFree(required: { path: string; bytes: Uint8Array }, optional: { packageFiles?: PackageFileInventory; bundledImportPluginIds?: ReadonlySet<string>; shownPath?: string; notices?: string[] } = {}): boolean {
  const shownPath = optional.shownPath ?? required.path;
  const text = Buffer.from(required.bytes).toString("latin1");
  // Only code can contain credential references; content/settings retain strict secret detection.
  const codeAware = /\.(?:js|mjs|cjs|ts|tsx|jsx)$/i.test(required.path);
  // Bundled code legitimately contains translated labels ("API token": "Token de API"), JSDoc
  // types and doc placeholders (`Authorization: Bearer <API_KEY>`). Import classifies package roots
  // by LOCAL bundled id, independently of source-build digest; export uses the same local bundled ids. Provider keys, PEM and JWT are always omitted. This is scan classification, never execution
  // trust: imported packages stay quarantined and restore seeds this build's own code.
  const vendorOnly = optional.bundledImportPluginIds === undefined
    ? verifiedPackageFile(required, optional)
    : bundledImportPackage(required, optional);
  // Code-aware tokenization intentionally preserves identifiers. Provider shapes must still
  // be omitted even when a bare identifier happens to spell a real key.
  const providerKey = redactSecretShapes({ text }, { vendorOnly: true }).redactions > 0;
  // Media archive names are generated from slug + allowed document type (a Keynote deck is
  // `.key`), so only their bytes decide; name rules would silently drop ordinary uploads.
  const secretName = !required.path.startsWith("media/") && secretSharePath(required, { packageContent: vendorOnly });
  const omitted = providerKey || secretName || redactSecretShapes({ text }, { codeAware, vendorOnly }).redactions > 0;
  if (omitted && optional.notices) addShareOmission({ notices: optional.notices, location: shownPath });
  return !omitted;
}

function unsafeSharePath(message: string): never { throw new SiteShareRefusal({ code: "UNSAFE_PATH", message }); }

/** Upper/lower expansion also catches sharp-s/SS and final-sigma aliases, including ancestors. */
export function sharePathAlias(required: { path: string }, _options: Record<string, never> = {}): string { return required.path.normalize("NFKC").toUpperCase().toLowerCase().normalize("NFC"); }

/** Reject aliases, including aliases in directory ancestors, before any content is read.
 * Mutates only the caller's per-archive claim sets; throws UNSAFE_PATH on conflicts.
 * @complexity O(path depth² + prior claims), bounded by 32 segments and 2,000 ZIP entries.
 */
export function claimSharePath(required: { path: string; directory: boolean; aliases: Map<string, string>; files: Set<string> }, _options: Record<string, never> = {}): void {
  validateSharePath({ path: required.path });
  const parts = required.path.split("/");
  for (let index = 1; index <= parts.length; index++) {
    const spelling = parts.slice(0, index).join("/");
    const alias = sharePathAlias({ path: spelling });
    const prior = required.aliases.get(alias);
    if (prior !== undefined && prior !== spelling) unsafeSharePath("ZIP contains unsafe case or Unicode aliases.");
    required.aliases.set(alias, spelling);
    if (index < parts.length && required.files.has(alias)) unsafeSharePath("ZIP file/directory collision.");
  }
  const key = sharePathAlias(required);
  if (!required.directory) {
    if (required.files.has(key) || [...required.aliases.keys()].some(alias => alias.startsWith(key + "/"))) unsafeSharePath("Duplicate file or file/directory collision.");
    required.files.add(key);
  }
}

