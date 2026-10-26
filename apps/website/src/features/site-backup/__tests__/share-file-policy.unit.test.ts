/**
 * Pins every branch of the share file policy (what is excluded, what refuses, which spellings are
 * portable, what counts as a secret, and archive-wide alias claims) with exact refusal texts, so
 * what may be shared stays provably identical across refactors.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { packAgentPluginDirectory } from "../../agent-plugins/lifecycle.js";
import { readBundledPackageFiles } from "../package-file-inventory.js";
import { claimSharePath, excludedSharePath, requireShareSecretFree, sharePathAlias, validateSharePath, type PackageFileInventory } from "../share-file-policy.js";

const HEX = "a".repeat(64);
const PACKAGE_ROOT = `agent-plugins/ws/w/p/package/sha256/${HEX}`;
const providerKey = (): string => ["gh", "p_"].join("") + "x".repeat(36);
const suspicious = (path: string) => ({ code: "UNSAFE_FILE", message: `Share refuses suspicious required path '${path}'. Remove it before sharing.` });
const unsafe = (path: string, reason?: string) => ({ code: "UNSAFE_PATH", message: `Share path '${path}' is unsafe${reason ? `: ${reason}` : "."}` });
const secret = (path: string) => ({ code: "SECRET_IN_CONTENT", message: `Share refused: '${path}' contains credential-shaped content. Remove the secret before sharing.` });
const claims = () => ({ aliases: new Map<string, string>(), files: new Set<string>() });
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** An inventory in which this build ships `files` (package-relative path -> text) under {@link HEX}. */
const shipped = (files: Record<string, string>): PackageFileInventory => new Map([[HEX, new Map(Object.entries(files).map(([name, text]) => [name, sha256(text)]))]]);
const LABELS = `"API token": "Token de API"`;

for (const path of [
  "plugins/a/1/data", "plugins/a/1/memory/learned.md", "agent-plugins/ws/w/data/x", "agent-plugins/ws/w/staging",
  "agent-plugins/ws/w/p/data", "agent-plugins/ws/w/p/memory/x", "uploads/chat-attachments", "uploads/chat-attachments/a.png",
  "Uploads/Chat-Attachments/a.png", "themes/.env", "themes/.env.production", "themes/chat.db", "settings/chat.db-wal", "settings/chat.db.bak",
]) {
  test(`'${path}' is a known private location and is excluded`, () => { assert.equal(excludedSharePath({ path }), true); });
}

for (const path of ["plugins/a/1/src/data/x", "plugins/a/data", "agent-plugins/ws/w/p/q/data", "uploads/chat-attachmentsx", "themes/chat.dbx", "themes/site/index.html"]) {
  test(`'${path}' is ordinary content and is kept`, () => { assert.equal(excludedSharePath({ path }), false); });
}

for (const part of [
  ".git", "node_modules", ".publish-staging", ".publish-previous", ".storage-secret.json", ".DS_Store", "_share", "mcp.json", ".npmrc", ".netrc", ".fs-custom-root.json",
  ".share-private", "my-credentials.txt", "vault", "keyring.json", "site-key", "private-key", "private_key.txt", "privatekey",
  "id_rsa", "id_dsa.pub", "id_ecdsa", "id_ed25519", "cert.pem", "tls.key", "cert.p12", "cert.pfx", "cert.pem.bak", "tls.key-old",
  "x.db", "x.sqlite", "x.sqlite3", "x.db-wal", ".mcp.json", ".mcp.local.json", "restore-point-1", "superseded-1",
]) {
  test(`a '${part}' segment refuses the share by its original path`, () => {
    const path = `themes/site/${part}/index.html`;
    assert.throws(() => excludedSharePath({ path }), suspicious(path));
  });
}

for (const name of ["mcp.json", "tovu-credential-schemes.json", "nested/dir/MCP.json"]) {
  test(`'${name}' below an installed package root is package content`, () => { assert.equal(excludedSharePath({ path: `${PACKAGE_ROOT}/${name}` }), false); });
}

test("other suspicious names below a package root still refuse", () => {
  const path = `${PACKAGE_ROOT}/.npmrc`;
  assert.throws(() => excludedSharePath({ path }), suspicious(path));
});

for (const name of ["__tests__/credential-card.test.mjs", "src/vault.js", "docs/keyring.md", "docs/private-key-setup.md"]) {
  test(`a credential-like name below an installed package root is package content (${name})`, () => {
    assert.equal(excludedSharePath({ path: `${PACKAGE_ROOT}/${name}` }), false);
  });
}

for (const path of [
  "plugins/p/__tests__/credential-card.test.mjs", "agent-plugins/ws/w/p/__tests__/credential-card.test.mjs",
  `agent-plugins/ws/w/credential/package/sha256/${HEX}/x`, `agent-plugins/ws/w/p/package/sha256/${"a".repeat(63)}/credential-card.test.mjs`,
]) {
  test(`a credential-like name outside an installed package root still refuses (${path})`, () => {
    assert.throws(() => excludedSharePath({ path }), suspicious(path));
  });
}

for (const name of ["certs/tls.pem", "keys/deploy.key", ".git/config", "node_modules/x/index.js", "data.db", "id_rsa", ".mcp.json"]) {
  test(`every other suspicious-name rule still refuses below a package root (${name})`, () => {
    const path = `${PACKAGE_ROOT}/${name}`;
    assert.throws(() => excludedSharePath({ path }), suspicious(path));
  });
}

test("a .env file below a package root is still a private location and is excluded", () => {
  assert.equal(excludedSharePath({ path: `${PACKAGE_ROOT}/.env` }), true);
});

test("the content scan still refuses a PEM private key inside an exempted package file", () => {
  const path = `${PACKAGE_ROOT}/__tests__/credential-card.test.mjs`;
  const label = ["PRIVATE", "KEY"].join(" ");
  const pem = `-----BEGIN ${label}-----\n${"A".repeat(64)}\n-----END ${label}-----`;
  const text = `const fixture = \`${pem}\`;`;
  // Even bytes this build ships are refused for a PEM key: verification relaxes the scan, never skips it.
  assert.throws(() => requireShareSecretFree({ path, bytes: Buffer.from(text) }, { packageFiles: shipped({ "__tests__/credential-card.test.mjs": text }) }), secret(path));
});

test("the content scan still refuses a provider key inside an exempted package file", () => {
  const path = `${PACKAGE_ROOT}/__tests__/credential-card.test.mjs`;
  const text = `const token = "${providerKey()}";`;
  assert.throws(() => requireShareSecretFree({ path, bytes: Buffer.from(text) }, { packageFiles: shipped({ "__tests__/credential-card.test.mjs": text }) }), secret(path));
});

// Verification: a package-shaped path is trusted only for files this build ships byte for byte.
const CARD = "__tests__/credential-card.test.mjs";
const CARD_TEXT = 'import test from "node:test";\ntest("credential card renders", () => {});\n';
const FORGED_ROOT = `agent-plugins/ws/w/p/package/sha256/${"b".repeat(64)}`;
const PASSWORD = '{"password": "Zq7xK2mP9vR4tL8wN3bY6cH1"}';

test("a bundled package file this build ships byte for byte keeps its credential-like name", () => {
  const path = `${PACKAGE_ROOT}/${CARD}`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(CARD_TEXT) }, { packageFiles: shipped({ [CARD]: CARD_TEXT }) }), undefined);
});

for (const [label, root, packageFiles] of [
  ["no inventory", PACKAGE_ROOT, undefined],
  ["a digest this build never shipped", FORGED_ROOT, shipped({ "credentials.json": PASSWORD })],
] as const) {
  test(`a forged package-shaped credentials.json holding a password is refused (${label})`, () => {
    const path = `${root}/credentials.json`;
    assert.equal(excludedSharePath({ path }), false, "the walk's name check is provisional below a package root");
    assert.throws(() => requireShareSecretFree({ path, bytes: Buffer.from(PASSWORD) }, { packageFiles }), suspicious(path));
  });
}

test("a file a verified package root does not list gets every name rule and the full scan", () => {
  const packageFiles = shipped({ [CARD]: CARD_TEXT });
  const named = `${PACKAGE_ROOT}/extra-credentials.json`;
  assert.throws(() => requireShareSecretFree({ path: named, bytes: Buffer.from("{}") }, { packageFiles }), suspicious(named));
  const plain = `${PACKAGE_ROOT}/config.json`;
  assert.throws(() => requireShareSecretFree({ path: plain, bytes: Buffer.from(PASSWORD) }, { packageFiles }), secret(plain));
});

test("a listed file whose bytes differ from the build's gets the ordinary rules", () => {
  const path = `${PACKAGE_ROOT}/${CARD}`;
  assert.throws(() => requireShareSecretFree({ path, bytes: Buffer.from(`${CARD_TEXT}// edited\n`) }, { packageFiles: shipped({ [CARD]: CARD_TEXT }) }), suspicious(path));
});

test("an opaque credentials.gz under a forged root is refused by name; the scanner never decodes it", () => {
  const path = `${FORGED_ROOT}/credentials.gz`;
  assert.throws(() => requireShareSecretFree({ path, bytes: gzipSync(PASSWORD) }, { packageFiles: shipped({ [CARD]: CARD_TEXT }) }), suspicious(path));
});

test("package manifest names stay exempt by name below any package root; their bytes get the full scan", () => {
  const path = `${FORGED_ROOT}/tovu-credential-schemes.json`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from('{"schemes":[]}') }), undefined);
  assert.throws(() => requireShareSecretFree({ path, bytes: Buffer.from(PASSWORD) }), secret(path));
});

test("the inventory is keyed by the digest the seeder's own packer gives each bundled source folder", async t => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "share-package-inventory-"));
  t.after(() => rm(sourceRoot, { recursive: true, force: true }));
  await mkdir(join(sourceRoot, "p", "__tests__"), { recursive: true });
  await writeFile(join(sourceRoot, "p", "plugin.json"), '{"name":"p"}');
  await writeFile(join(sourceRoot, "p", CARD), CARD_TEXT);
  await writeFile(join(sourceRoot, "README.md"), "not a package folder");
  const packageFiles = await readBundledPackageFiles({}, { sourceRoot });
  const { sha256: digest } = await packAgentPluginDirectory(join(sourceRoot, "p"));
  assert.deepEqual([...packageFiles.keys()], [digest]);
  assert.deepEqual(Object.fromEntries(packageFiles.get(digest)!), { [CARD]: sha256(CARD_TEXT), "plugin.json": sha256('{"name":"p"}') });
  const path = `agent-plugins/ws/w/p/package/sha256/${digest}/${CARD}`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(CARD_TEXT) }, { packageFiles }), undefined);
});

test("a missing bundled source root verifies nothing", async t => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "share-package-inventory-"));
  t.after(() => rm(sourceRoot, { recursive: true, force: true }));
  assert.equal((await readBundledPackageFiles({}, { sourceRoot: join(sourceRoot, "missing") })).size, 0);
});

test("the package exemption covers only segments below the seven-segment root", () => {
  const path = `agent-plugins/ws/w/mcp.json/package/sha256/${HEX}/x`;
  assert.throws(() => excludedSharePath({ path }), suspicious(path));
});

test("a package exemption name outside any package root refuses", () => {
  const path = "plugins/p/tovu-credential-schemes.json";
  assert.throws(() => excludedSharePath({ path }), suspicious(path));
});

test("the trusted database projection path is exempt from the tree-path deny list", () => {
  assert.equal(validateSharePath({ path: "database/content.db" }), undefined);
});

test("an ordinary portable path passes", () => {
  assert.equal(validateSharePath({ path: "themes/site/Index Page.html" }), undefined);
});

for (const [path, reason] of [
  ["themes/content.db", `"themes/content.db" has a '.db' extension, which is never published`],
  ["themes\\a.txt", `"themes\\a.txt" contains a backslash, which is never allowed in a tree path`],
  ["themes/\u0000", `"themes/\u0000" contains a NUL byte`],
  ["themes/" + Array(33).fill("x").join("/"), `"themes/${Array(33).fill("x").join("/")}" is nested deeper than the 16-level limit`],
] as const) {
  test(`a tree-path refusal is reported with its reason (${JSON.stringify(path).slice(0, 24)})`, () => {
    assert.throws(() => validateSharePath({ path }), unsafe(path, reason));
  });
}

for (const path of [
  "themes/a:b", "themes/100%", "themes/a\u0001", "themes/a\u007f", "themes/é", "themes/ﬁle",
  "themes/a<b", "themes/a>b", "themes/a\"b", "themes/a|b", "themes/a?b", "themes/a*b",
  "themes/con", "themes/CON.txt", "themes/prn", "themes/aux.md", "themes/nul", "themes/com1", "themes/lpt9.x",
  "themes/x.", "themes/x /y",
]) {
  test(`a spelling some recipient filesystem rejects or aliases is unsafe (${JSON.stringify(path)})`, () => {
    assert.throws(() => validateSharePath({ path }), unsafe(path));
  });
}

for (const path of ["themes/console", "themes/com0", "themes/x.y", "themes/ x"]) {
  test(`a near-miss spelling stays portable (${JSON.stringify(path)})`, () => { assert.equal(validateSharePath({ path }), undefined); });
}

test("plain content bytes are secret-free", () => {
  assert.equal(requireShareSecretFree({ path: "themes/a.txt", bytes: Buffer.from("hello") }), undefined);
});

test("a provider key format refuses the share", () => {
  assert.throws(() => requireShareSecretFree({ path: "themes/a.txt", bytes: Buffer.from(`token ${providerKey()}`) }), secret("themes/a.txt"));
});

test("a provider key inside binary bytes refuses the share", () => {
  assert.throws(() => requireShareSecretFree({ path: "themes/a.png", bytes: Buffer.from(`\u0000ÿ${providerKey()}\u0000`, "latin1") }), secret("themes/a.png"));
});

test("a credential reference in content (not code) refuses the share", () => {
  assert.throws(() => requireShareSecretFree({ path: "settings/notes.json", bytes: Buffer.from("const apiKey = process.env.API_KEY;") }), secret("settings/notes.json"));
});

for (const path of ["plugins/p/index.js", "plugins/p/index.MJS", "plugins/p/a.cjs", "plugins/p/a.ts", "plugins/p/a.tsx", "plugins/p/a.jsx"]) {
  test(`a credential reference in code is allowed (${path})`, () => {
    assert.equal(requireShareSecretFree({ path, bytes: Buffer.from("const apiKey = process.env.API_KEY;") }), undefined);
  });
}

test("translated credential labels in a verified package file are allowed", () => {
  assert.equal(requireShareSecretFree({ path: `${PACKAGE_ROOT}/locales/es.json`, bytes: Buffer.from(LABELS) }, { packageFiles: shipped({ "locales/es.json": LABELS }) }), undefined);
});

test("the package payload relaxation matches the package root case-insensitively", () => {
  const path = `Agent-Plugins/WS/w/p/Package/SHA256/${HEX}/locales/es.json`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(LABELS) }, { packageFiles: shipped({ "locales/es.json": LABELS }) }), undefined);
});

test("the same labels in an unverified package-shaped file get the full scan", () => {
  const path = `${PACKAGE_ROOT}/locales/es.json`;
  assert.throws(() => requireShareSecretFree({ path, bytes: Buffer.from(LABELS) }), secret(path));
});

test("a provider key in an installed package payload still refuses", () => {
  const path = `${PACKAGE_ROOT}/locales/es.json`;
  assert.throws(() => requireShareSecretFree({ path, bytes: Buffer.from(providerKey()) }), secret(path));
});

test("aliases fold case, compatibility forms, sharp-s and final sigma onto one key", () => {
  assert.deepEqual(["Themes/A", "themes/\ufb01le", "themes/Stra\u00dfe", "themes/\u039f\u0394\u039f\u03a3", "themes/\u03bf\u03b4\u03bf\u03c3"].map(path => sharePathAlias({ path })),
    ["themes/a", "themes/file", "themes/strasse", "themes/\u03bf\u03b4\u03bf\u03c2", "themes/\u03bf\u03b4\u03bf\u03c2"]);
});

test("a claim validates its path first", () => {
  assert.throws(() => claimSharePath({ path: "themes/a?b", directory: false, ...claims() }), unsafe("themes/a?b"));
});

test("a claim records every ancestor spelling and the file key", () => {
  const sets = claims();
  claimSharePath({ path: "themes/A/x.txt", directory: false, ...sets });
  assert.deepEqual({ aliases: [...sets.aliases], files: [...sets.files] }, { aliases: [["themes", "themes"], ["themes/a", "themes/A"], ["themes/a/x.txt", "themes/A/x.txt"]], files: ["themes/a/x.txt"] });
});

test("a directory claim records spellings but no file key", () => {
  const sets = claims();
  claimSharePath({ path: "themes/d", directory: true, ...sets });
  assert.deepEqual({ aliases: [...sets.aliases.keys()], files: [...sets.files] }, { aliases: ["themes", "themes/d"], files: [] });
});

test("the same directory spelling may be claimed twice and hold files", () => {
  const sets = claims();
  for (const [path, directory] of [["themes/d", true], ["themes/d", true], ["themes/d/x", false]] as const) claimSharePath({ path, directory, ...sets });
  assert.deepEqual([...sets.files], ["themes/d/x"]);
});

test("two spellings of one ancestor are refused as aliases", () => {
  const sets = claims();
  claimSharePath({ path: "themes/A/x", directory: false, ...sets });
  assert.throws(() => claimSharePath({ path: "themes/a/y", directory: false, ...sets }), { code: "UNSAFE_PATH", message: "ZIP contains unsafe case or Unicode aliases." });
});

test("a path below an already-claimed file is a file/directory collision", () => {
  const sets = claims();
  claimSharePath({ path: "themes/file", directory: false, ...sets });
  assert.throws(() => claimSharePath({ path: "themes/file/child", directory: false, ...sets }), { code: "UNSAFE_PATH", message: "ZIP file/directory collision." });
});

test("a file over an already-claimed directory is a duplicate", () => {
  const sets = claims();
  claimSharePath({ path: "themes/file/child", directory: false, ...sets });
  assert.throws(() => claimSharePath({ path: "themes/file", directory: false, ...sets }), { code: "UNSAFE_PATH", message: "Duplicate file or file/directory collision." });
});

test("the same file claimed twice is a duplicate", () => {
  const sets = claims();
  claimSharePath({ path: "themes/x", directory: false, ...sets });
  assert.throws(() => claimSharePath({ path: "themes/x", directory: false, ...sets }), { code: "UNSAFE_PATH", message: "Duplicate file or file/directory collision." });
});

test("a sibling sharing a name prefix is not a collision", () => {
  const sets = claims();
  claimSharePath({ path: "themes/file-a/x", directory: false, ...sets });
  claimSharePath({ path: "themes/file", directory: false, ...sets });
  assert.deepEqual([...sets.files], ["themes/file-a/x", "themes/file"]);
});
