import { checkTreePath } from "../publish-content/file-tree-policy.js";
import { SiteShareRefusal, SHARE_LIMITS } from "./share-policy.js";
import { redactSecretShapes } from "#src/contracts/core/secret-redaction";

/** The seven-segment root of an installed plugin package payload (matched against the lowercased path). */
const PACKAGE_CONTENT_ROOT = /^agent-plugins\/ws\/[^/]+\/[^/]+\/package\/sha256\/[a-f0-9]{64}\//;

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

/** A name that only hints at a secret; the file's bytes decide (see excludedSharePath). */
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

/** Exclude known private locations only; suspicious required content must refuse, not disappear. O(depth). */
export function excludedSharePath(required: { path: string }, _optional: Record<string, never> = {}): boolean {
  const p = required.path.toLowerCase();
  const parts = p.split("/");
  if (excludedRuntimeSharePath({ path: p, parts })) return true;
  // Installed packages ship MCP declarations and credential schemas as content, not runtime secrets.
  // Exempt only those names below the seven-segment package root; their bytes still get secret-scanned.
  // Below that root the name-only credential hint is dropped too: bundled plugins ship files such as
  // __tests__/credential-card.test.mjs, the bytes are integrity-hashed at install, and
  // requireShareSecretFree still refuses provider keys, PEM and JWT inside them. Every other name rule stays.
  const packageContent = PACKAGE_CONTENT_ROOT.test(p);
  const suspicious = (part: string, index: number): boolean => {
    const inPackage = packageContent && index >= 7;
    return !(inPackage && part === "mcp.json") && suspiciousSharePart({ part }, { packageContent: inPackage });
  };
  if (parts.some(suspicious)) {
    throw new SiteShareRefusal({ code: "UNSAFE_FILE", message: `Share refuses suspicious required path '${required.path}'. Remove it before sharing.` });
  }
  return false;
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
export function requireShareSecretFree(required: { path: string; bytes: Uint8Array }, _optional: Record<string, never> = {}): void {
  const text = Buffer.from(required.bytes).toString("latin1");
  // Only code can contain credential references; content/settings retain strict secret detection.
  const codeAware = /\.(?:js|mjs|cjs|ts|tsx|jsx)$/i.test(required.path);
  // Package payloads are content-addressed installs of public plugin code, docs and manifests: their
  // translated labels ("API token": "Token de API") and doc placeholders (`Authorization: Bearer <API_KEY>`)
  // are not owner secrets, so only provider key formats, PEM and JWT shapes refuse them.
  const vendorOnly = PACKAGE_CONTENT_ROOT.test(required.path.toLowerCase());
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

