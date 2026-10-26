import { createHash } from "node:crypto";
import { checkTreePath } from "../publish-content/file-tree-policy.js";
import { SiteShareRefusal, SHARE_LIMITS } from "./share-policy.js";
import { redactSecretShapes } from "#src/contracts/core/secret-redaction";

/** The seven-segment root of an installed plugin package payload (matched against the lowercased path). */
const PACKAGE_CONTENT_ROOT = /^agent-plugins\/ws\/[^/]+\/[^/]+\/package\/sha256\/[a-f0-9]{64}\//;
/** The same root, capturing its archive digest and the package-relative path below it. */
const PACKAGE_FILE = /^agent-plugins\/ws\/[^/]+\/[^/]+\/package\/sha256\/([a-f0-9]{64})\/(.+)$/i;
/** Names an installed package ships as content (MCP declarations, credential schemes), never runtime secrets. */
const PACKAGE_MANIFEST_NAMES = ["mcp.json", "tovu-credential-schemes.json"];

/** Archive digest -> (package-relative path -> SHA-256 of the bytes) for every package THIS build
 *  ships (`package-file-inventory.ts`). The only proof a package-shaped path is the installer's. */
export type PackageFileInventory = ReadonlyMap<string, ReadonlyMap<string, string>>;

/** True for the only path shape {@link PackageFileInventory} can ever verify. O(path). */
export function isPackageFilePath(required: { path: string }, _optional: Record<string, never> = {}): boolean {
  return PACKAGE_FILE.test(required.path);
}

function excludedRuntimeSharePath({ path, parts }: { path: string; parts: string[] }, _options = {}): boolean {
  // Plugin runtime data/memory have fixed roots. A package's src/data or docs/notes is content.
  const roots = [
    /^plugins\/[^/]+\/[^/]+\/(?:data|memory)(?:\/|$)/,
    /^agent-plugins\/ws\/[^/]+\/(?:data|staging)(?:\/|$)/,
    /^agent-plugins\/ws\/[^/]+\/[^/]+\/(?:data|memory)(?:\/|$)/,
    /^uploads\/chat-attachments(?:\/|$)/,
  ];
  return roots.some(root => root.test(path)) ||
    parts.some(part => part.startsWith(".env") || /^chat\.db(?:$|[.-])/.test(part));
}

/** A name that only hints at a secret; below a package root the file's bytes decide (see requireShareSecretFree). */
const CREDENTIAL_NAME = /(?:credential|vault|keyring|site-key|private[-_]?key)/;

function suspiciousSharePart({ part }: { part: string }, { packageContent = false } = {}): boolean {
  const names = [".git", "node_modules", ".publish-staging", ".publish-previous", ".storage-secret.json", ".ds_store", "_share", "mcp.json", ".npmrc", ".netrc", ".fs-custom-root.json"];
  const prefixes = [".share-", "restore-point-", "superseded-"];
  const patterns = [
    /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/,
    /\.(?:pem|key|p12|pfx)(?:[.-]|$)/,
    /\.(?:db|sqlite|sqlite3)(?:$|[.-])/,
    /^\.mcp(?:\..*)?\.json$/,
  ];
  return names.includes(part) || prefixes.some(prefix => part.startsWith(prefix)) || patterns.some(pattern => pattern.test(part)) ||
    (!packageContent && CREDENTIAL_NAME.test(part));
}

/** Exclude known private locations only; suspicious required content must refuse, not disappear. O(depth).
 * Names only: below a package root a credential-like name is provisional, and
 * {@link requireShareSecretFree}, which has the bytes, keeps it only for a verified package file. */
export function excludedSharePath(required: { path: string }, _optional: Record<string, never> = {}): boolean {
  const p = required.path.toLowerCase();
  if (excludedRuntimeSharePath({ path: p, parts: p.split("/") })) return true;
  refuseSuspiciousSharePath(required, { credentialNameAllowed: true });
  return false;
}

/** Refuses a suspicious segment. {@link PACKAGE_MANIFEST_NAMES} pass below the seven-segment package
 *  root, their bytes still scanned; a credential-like name passes there only when `credentialNameAllowed`.
 *  Every other name rule (.git, node_modules, .pem/.key, .db, id_rsa, .mcp*.json, .npmrc) always applies. */
function refuseSuspiciousSharePath(required: { path: string }, { credentialNameAllowed }: { credentialNameAllowed: boolean }): void {
  const p = required.path.toLowerCase();
  const packageContent = PACKAGE_CONTENT_ROOT.test(p);
  const suspicious = (part: string, index: number): boolean => {
    const inPackage = packageContent && index >= 7;
    return !(inPackage && PACKAGE_MANIFEST_NAMES.includes(part)) && suspiciousSharePart({ part }, { packageContent: inPackage && credentialNameAllowed });
  };
  if (p.split("/").some(suspicious)) {
    throw new SiteShareRefusal({ code: "UNSAFE_FILE", message: `Share refuses suspicious required path '${required.path}'. Remove it before sharing.` });
  }
}

/**
 * True only when this build ships these exact bytes at this package-relative path under this digest.
 * Anyone who can write into the site folder can create a package-SHAPED path, and install records
 * live in that same folder, so the shape, the folder name and the ledger prove nothing; the build's
 * own bundled sources do. An operator-installed package, a superseded digest, an unlisted file under a
 * verified root, or a tampered file all get the ordinary rules. O(bytes).
 */
function verifiedPackageFile(required: { path: string; bytes: Uint8Array }, optional: { packageFiles?: PackageFileInventory | undefined }): boolean {
  const match = PACKAGE_FILE.exec(required.path);
  if (!match) return false;
  // The root: a digest this build ships. The file: listed below that root, with the same bytes.
  const shipped = optional.packageFiles?.get(match[1]!.toLowerCase());
  const expected = shipped?.get(match[2]!);
  return expected !== undefined && createHash("sha256").update(required.bytes).digest("hex") === expected;
}

/** True for a spelling some supported recipient filesystem rejects, rewrites or aliases. O(path). */
function hasUnportableSpelling(required: { path: string }): boolean {
  const p = required.path;
  const parts = p.split("/");
  return /[:%\x00-\x1f\x7f\\]/.test(p) || p.normalize("NFC") !== p || p.normalize("NFKC") !== p || /[<>"|?*]/.test(p) ||
    parts.some(part => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || parts.length > SHARE_LIMITS.maxPathSegments ||
    parts.some(part => /[. ]$/.test(part));
}

/** A ZIP path has one canonical spelling on every supported recipient filesystem. O(path). */
export function validateSharePath(required: { path: string }, _optional: Record<string, never> = {}): void {
  const p = required.path;
  // This one exact path is produced by trusted projection, never by a filesystem walk.
  const reason = p === "database/content.db" ? null : checkTreePath(p);
  if (reason || hasUnportableSpelling({ path: p })) {
    const suffix = reason ? `: ${reason}` : ".";
    throw new SiteShareRefusal({ code: "UNSAFE_PATH", message: `Share path '${p}' is unsafe${suffix}` });
  }
}

/** Scan the complete bytes, including binary content; a required file is refused, never damaged. O(bytes). */
export function requireShareSecretFree(required: { path: string; bytes: Uint8Array }, optional: { packageFiles?: PackageFileInventory | undefined } = {}): void {
  const text = Buffer.from(required.bytes).toString("latin1");
  // Only code can contain credential references; content/settings retain strict secret detection.
  const codeAware = /\.(?:js|mjs|cjs|ts|tsx|jsx)$/i.test(required.path);
  // A verified package file is public plugin code, docs and manifests this build ships: its translated
  // labels ("API token": "Token de API"), doc placeholders (`Authorization: Bearer <API_KEY>`) and test
  // names (__tests__/credential-card.test.mjs) are not owner secrets, so only provider key formats, PEM
  // and JWT shapes refuse it. Any other package-shaped file gets every name rule and the full scan. The
  // scanner does not decode compressed or encoded bytes (credentials.gz), so for those the name refusal
  // is the guard; a verified one is the build's own bytes, so nothing is hidden in it.
  const vendorOnly = verifiedPackageFile(required, optional);
  if (!vendorOnly && PACKAGE_CONTENT_ROOT.test(required.path.toLowerCase())) refuseSuspiciousSharePath(required, { credentialNameAllowed: false });
  if (redactSecretShapes({ text }, { codeAware, vendorOnly }).redactions > 0) throw new SiteShareRefusal({ code: "SECRET_IN_CONTENT", message: `Share refused: '${required.path}' contains credential-shaped content. Remove the secret before sharing.` });
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

