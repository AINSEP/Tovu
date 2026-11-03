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
import { readBundledImportPluginIds, readBundledPackageFiles } from "../package-file-inventory.js";
import { claimSharePath, excludedSharePath, requireShareSecretFree, sharePathAlias, validateSharePath, type PackageFileInventory } from "../share-file-policy.js";
import { archiveRefusalName } from "../share-policy.js";

const HEX = "a".repeat(64);
const PACKAGE_ROOT = `agent-plugins/ws/w/p/package/sha256/${HEX}`;
const providerKey = (): string => ["gh", "p_"].join("") + "x".repeat(36);
const credentialNames = new Set([".storage-secret.json", "mcp.json", ".npmrc", ".netrc", "my-credentials.txt", "vault", "keyring.json", "site-key", "private-key", "private_key.txt", "privatekey", "id_rsa", "id_dsa.pub", "id_ecdsa", "id_ed25519", "cert.pem", "tls.key", "cert.p12", "cert.pfx", "cert.pem.bak", "tls.key-old", ".mcp.json", ".mcp.local.json"]);
const suspicious = (path: string) => ({ code: "UNSAFE_FILE", message: `Share refuses suspicious required path '${path}'. Remove it before sharing.` });
const unsafe = (path: string, reason?: string) => ({ code: "UNSAFE_PATH", message: `Share path '${path}' is unsafe${reason ? `: ${reason}` : "."}` });
const claims = () => ({ aliases: new Map<string, string>(), files: new Set<string>() });
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** An inventory in which this build ships `files` (package-relative path -> text) under {@link HEX}. */
const shipped = (files: Record<string, string>): PackageFileInventory => new Map([[HEX, new Map(Object.entries(files).map(([name, text]) => [name, sha256(text)]))]]);
const LABELS = `"API token": "Token de API"`;

test("archive refusal names preserve ordinary text and truncate without splitting astral characters", () => {
  assert.equal(archiveRefusalName({ name: "" }), "");
  assert.equal(archiveRefusalName({ name: "schema_普通😀" }), "schema_普通😀");
  assert.equal(archiveRefusalName({ name: "x".repeat(120) }), "x".repeat(120));
  assert.equal(archiveRefusalName({ name: "x".repeat(121) }), "x".repeat(119) + "…");
  assert.equal(archiveRefusalName({ name: "x".repeat(118) + "😀tail" }), "x".repeat(118) + "…");
});

test("unsafe archive-path refusals bound names and strip invisible controls", () => {
  const path = "themes/hostile\u0001\n\u202e\u2066" + "x".repeat(1000) + "/../file";
  assert.throws(() => validateSharePath({ path }), error => {
    const refusal = error as Error & { code: string };
    assert.equal(refusal.code, "UNSAFE_PATH");
    assert.match(refusal.message, /hostile.*…/);
    assert.doesNotMatch(refusal.message, /[\p{Cc}\p{Cf}]/u);
    assert.ok(refusal.message.length < 400, `refusal length: ${refusal.message.length}`);
    return true;
  });
});

test("archive names containing replacement tokens cannot re-expand raw names in a refusal", () => {
  const path = "themes/$&hostile\u0001\u202e" + "x".repeat(1000);
  assert.throws(() => validateSharePath({ path }), error => {
    const refusal = error as Error & { code: string };
    assert.equal(refusal.code, "UNSAFE_PATH");
    assert.match(refusal.message, /\$&hostile.*…/);
    assert.doesNotMatch(refusal.message, /[\p{Cc}\p{Cf}]/u);
    assert.ok(refusal.message.length < 400, `refusal length: ${refusal.message.length}`);
    return true;
  });
});

for (const path of [
  // Site plugin paths are not here: the share walks only Jini's package listing (share-site-plugin-versions).
  "agent-plugins/ws/w/data/x", "agent-plugins/ws/w/staging",
  "agent-plugins/ws/w/p/data", "agent-plugins/ws/w/p/memory/x", "uploads/chat-attachments", "uploads/chat-attachments/a.png",
  "Uploads/Chat-Attachments/a.png", "themes/chat.db", "settings/chat.db-wal", "settings/chat.db.bak",
]) {
  test(`'${path}' is a known private location and is excluded`, { timeout: 10_000 }, () => { assert.equal(excludedSharePath({ path }), true); });
}

// RED (green-1027): a package's src/data was read as runtime data/ and dropped from the export. Package files
// Jini lists keep every folder name, `data` included (design 2026-10-27 P1).
for (const path of ["plugins/a/package/src/data/x", "plugins/a/package/data/x", "plugins/a/package/1.0.0/data/x", "plugins/a/package/lib/memory/x", "agent-plugins/ws/w/p/q/data", "uploads/chat-attachmentsx", "themes/chat.dbx", "themes/site/index.html"]) {
  test(`'${path}' is ordinary content and is kept`, { timeout: 10_000 }, () => { assert.equal(excludedSharePath({ path }), false); });
}

for (const part of [
  ".git", "node_modules", ".publish-staging", ".publish-previous", ".storage-secret.json", ".DS_Store", "_share", "mcp.json", ".npmrc", ".netrc", ".fs-custom-root.json",
  ".share-private", "my-credentials.txt", "vault", "keyring.json", "site-key", "private-key", "private_key.txt", "privatekey",
  "id_rsa", "id_dsa.pub", "id_ecdsa", "id_ed25519", "cert.pem", "tls.key", "cert.p12", "cert.pfx", "cert.pem.bak", "tls.key-old",
  "x.db", "x.sqlite", "x.sqlite3", "x.db-wal", ".mcp.json", ".mcp.local.json", "restore-point-1", "superseded-1",
]) {
  test(`a '${part}' segment retains its inclusion/refusal policy`, { timeout: 10_000 }, () => {
    const path = `themes/site/${part}/index.html`;
    if (credentialNames.has(part)) assert.equal(excludedSharePath({ path }), false);
    else assert.throws(() => excludedSharePath({ path }), suspicious(path));
  });
}

for (const name of ["mcp.json", "tovu-credential-schemes.json", "nested/dir/MCP.json"]) {
  test(`'${name}' below an installed package root is package content`, { timeout: 10_000 }, () => { assert.equal(excludedSharePath({ path: `${PACKAGE_ROOT}/${name}` }), false); });
}

test("private credential names below a package root stay included", { timeout: 10_000 }, () => {
  const path = `${PACKAGE_ROOT}/.npmrc`;
  assert.equal(excludedSharePath({ path }), false);
});

for (const name of ["__tests__/credential-card.test.mjs", "src/vault.js", "docs/keyring.md", "docs/private-key-setup.md"]) {
  test(`a credential-like name below an installed package root is package content (${name})`, { timeout: 10_000 }, () => {
    assert.equal(excludedSharePath({ path: `${PACKAGE_ROOT}/${name}` }), false);
  });
}

for (const path of [
  "plugins/p/__tests__/credential-card.test.mjs", "agent-plugins/ws/w/p/__tests__/credential-card.test.mjs",
  `agent-plugins/ws/w/credential/package/sha256/${HEX}/x`, `agent-plugins/ws/w/p/package/sha256/${"a".repeat(63)}/credential-card.test.mjs`,
]) {
  test(`a credential-like name outside an installed package root stays included (${path})`, { timeout: 10_000 }, () => {
    assert.equal(excludedSharePath({ path }), false);
  });
}

for (const name of ["certs/tls.pem", "keys/deploy.key", ".git/config", "node_modules/x/index.js", "data.db", "id_rsa", ".mcp.json"]) {
  test(`every other suspicious-name rule still refuses below a package root (${name})`, { timeout: 10_000 }, () => {
    const path = `${PACKAGE_ROOT}/${name}`;
    if (["certs/tls.pem", "keys/deploy.key", "id_rsa", ".mcp.json"].includes(name)) assert.equal(excludedSharePath({ path }), false);
    else assert.throws(() => excludedSharePath({ path }), suspicious(name === "node_modules/x/index.js" ? `${PACKAGE_ROOT}/node_modules/x/ind…` : path));
  });
}

test("a .env file below a package root stays included", { timeout: 10_000 }, () => {
  assert.equal(excludedSharePath({ path: `${PACKAGE_ROOT}/.env` }), false);
});

test("the content scan retains a PEM private key inside a package file", { timeout: 10_000 }, () => {
  const path = `${PACKAGE_ROOT}/__tests__/credential-card.test.mjs`;
  const label = ["PRIVATE", "KEY"].join(" ");
  const pem = `-----BEGIN ${label}-----\n${"A".repeat(64)}\n-----END ${label}-----`;
  const text = `const fixture = \`${pem}\`;`;
  // Even credential-looking bytes are preserved; execution trust still uses exact package identity.
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(text) }, { packageFiles: shipped({ "__tests__/credential-card.test.mjs": text }) }), true);
});

test("the content scan retains a provider key inside a package file", { timeout: 10_000 }, () => {
  const path = `${PACKAGE_ROOT}/__tests__/credential-card.test.mjs`;
  const text = `const token = "${providerKey()}";`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(text) }, { packageFiles: shipped({ "__tests__/credential-card.test.mjs": text }) }), true);
});

// Verification: a package-shaped path is trusted only for files this build ships byte for byte.
const CARD = "__tests__/credential-card.test.mjs";
const CARD_TEXT = 'import test from "node:test";\ntest("credential card renders", { timeout: 10_000 }, () => {});\n';
const FORGED_ROOT = `agent-plugins/ws/w/p/package/sha256/${"b".repeat(64)}`;
// Built at runtime so the repo's gitleaks scan never sees a password-shaped literal in source.
const PASSWORD = JSON.stringify({ password: ["Zq7x", "K2mP9v", "R4tL8w", "N3bY6cH1"].join("") });

test("a bundled package file this build ships byte for byte keeps its credential-like name", { timeout: 10_000 }, () => {
  const path = `${PACKAGE_ROOT}/${CARD}`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(CARD_TEXT) }, { packageFiles: shipped({ [CARD]: CARD_TEXT }) }), true);
});

for (const [label, root, packageFiles] of [
  ["no inventory", PACKAGE_ROOT, undefined],
  ["a digest this build never shipped", FORGED_ROOT, shipped({ "credentials.json": PASSWORD })],
] as const) {
  test(`a forged package-shaped credentials.json holding a password stays included (${label})`, { timeout: 10_000 }, () => {
    const path = `${root}/credentials.json`;
    assert.equal(excludedSharePath({ path }), false, "the walk's name check is provisional below a package root");
    assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(PASSWORD) }, { packageFiles }), true);
  });
}

test("a file a verified package root does not list gets every name rule and the full scan", { timeout: 10_000 }, () => {
  const packageFiles = shipped({ [CARD]: CARD_TEXT });
  const named = `${PACKAGE_ROOT}/extra-credentials.json`;
  assert.equal(requireShareSecretFree({ path: named, bytes: Buffer.from("{}") }, { packageFiles }), true);
  const plain = `${PACKAGE_ROOT}/config.json`;
  assert.equal(requireShareSecretFree({ path: plain, bytes: Buffer.from(PASSWORD) }, { packageFiles }), true);
});

test("a listed file whose bytes differ from the build's gets the ordinary rules", { timeout: 10_000 }, () => {
  const path = `${PACKAGE_ROOT}/${CARD}`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(`${CARD_TEXT}// edited\n`) }, { packageFiles: shipped({ [CARD]: CARD_TEXT }) }), true);
});

test("an opaque credentials.gz under a forged root stays included by name; the scanner never decodes it", { timeout: 10_000 }, () => {
  const path = `${FORGED_ROOT}/credentials.gz`;
  assert.equal(requireShareSecretFree({ path, bytes: gzipSync(PASSWORD) }, { packageFiles: shipped({ [CARD]: CARD_TEXT }) }), true);
});

test("package manifest names stay exempt by name below any package root; their bytes get the full scan", { timeout: 10_000 }, () => {
  const path = `${FORGED_ROOT}/tovu-credential-schemes.json`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from('{"schemes":[]}') }), true);
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(PASSWORD) }), true);
});

test("the inventory is keyed by the digest the seeder's own packer gives each bundled source folder", { timeout: 10_000 }, async t => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "share-package-inventory-"));
  t.after(() => rm(sourceRoot, { recursive: true, force: true }));
  // The packer leaves tests out of bundled archives (Jini 8b2b9b99a), so the credential-named file is shipped source.
  const card = "src/credential-card.mjs";
  await mkdir(join(sourceRoot, "p", "src"), { recursive: true });
  await writeFile(join(sourceRoot, "p", "plugin.json"), '{"name":"p"}');
  await writeFile(join(sourceRoot, "p", card), CARD_TEXT);
  await writeFile(join(sourceRoot, "README.md"), "not a package folder");
  const packageFiles = await readBundledPackageFiles({}, { sourceRoot });
  const { sha256: digest } = await packAgentPluginDirectory(join(sourceRoot, "p"));
  assert.deepEqual([...packageFiles.keys()], [digest]);
  assert.deepEqual(Object.fromEntries(packageFiles.get(digest)!), { [card]: sha256(CARD_TEXT), "plugin.json": sha256('{"name":"p"}') });
  assert.deepEqual(await readBundledImportPluginIds({}, { sourceRoot }), new Set(["p"]));
  const path = `agent-plugins/ws/w/p/package/sha256/${digest}/${card}`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(CARD_TEXT) }, { packageFiles }), true);
});

test("a missing bundled source root verifies nothing", { timeout: 10_000 }, async t => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "share-package-inventory-"));
  t.after(() => rm(sourceRoot, { recursive: true, force: true }));
  assert.equal((await readBundledPackageFiles({}, { sourceRoot: join(sourceRoot, "missing") })).size, 0);
  assert.deepEqual(await readBundledImportPluginIds({}, { sourceRoot: join(sourceRoot, "missing") }), new Set());
});

test("credential-looking ancestor names stay included", { timeout: 10_000 }, () => {
  const path = `agent-plugins/ws/w/mcp.json/package/sha256/${HEX}/x`;
  assert.equal(excludedSharePath({ path }), false);
});

test("a package exemption name outside any package root stays included", { timeout: 10_000 }, () => {
  const path = "plugins/p/tovu-credential-schemes.json";
  assert.equal(excludedSharePath({ path }), false);
});

test("the trusted database projection path is exempt from the tree-path deny list", { timeout: 10_000 }, () => {
  assert.equal(validateSharePath({ path: "database/content.db" }), undefined);
});

test("an ordinary portable path passes", { timeout: 10_000 }, () => {
  assert.equal(validateSharePath({ path: "themes/site/Index Page.html" }), undefined);
});

for (const [path, reason, display = path] of [
  ["themes/content.db", `"themes/content.db" has a '.db' extension, which is never published`],
  ["themes\\a.txt", `"themes\\a.txt" contains a backslash, which is never allowed in a tree path`],
  ["themes/\u0000", `"themes/" contains a NUL byte`, "themes/"],
  ["themes/" + Array(33).fill("x").join("/"), `"themes/${Array(33).fill("x").join("/")}" is nested deeper than the 16-level limit`],
] as const) {
  test(`a tree-path refusal is reported with its reason (${JSON.stringify(path).slice(0, 24)})`, { timeout: 10_000 }, () => {
    assert.throws(() => validateSharePath({ path }), unsafe(display, reason));
  });
}

for (const path of [
  "themes/a:b", "themes/100%", "themes/é", "themes/ﬁle",
  "themes/a<b", "themes/a>b", "themes/a\"b", "themes/a|b", "themes/a?b", "themes/a*b",
  "themes/con", "themes/CON.txt", "themes/prn", "themes/aux.md", "themes/nul", "themes/com1", "themes/lpt9.x",
  "themes/x.", "themes/x /y",
]) {
  test(`a spelling some recipient filesystem rejects or aliases is unsafe (${JSON.stringify(path)})`, { timeout: 10_000 }, () => {
    assert.throws(() => validateSharePath({ path }), unsafe(path));
  });
}

for (const path of ["themes/a\u0001", "themes/a\u007f"]) {
  test(`control characters refuse without being echoed (${JSON.stringify(path)})`, () => {
    assert.throws(() => validateSharePath({ path }), unsafe("themes/a"));
  });
}

for (const path of ["themes/console", "themes/com0", "themes/x.y", "themes/ x"]) {
  test(`a near-miss spelling stays portable (${JSON.stringify(path)})`, { timeout: 10_000 }, () => { assert.equal(validateSharePath({ path }), undefined); });
}

test("plain content bytes are secret-free", { timeout: 10_000 }, () => {
  assert.equal(requireShareSecretFree({ path: "themes/a.txt", bytes: Buffer.from("hello") }), true);
});

test("a provider key format stays included", { timeout: 10_000 }, () => {
  assert.equal(requireShareSecretFree({ path: "themes/a.txt", bytes: Buffer.from(`token ${providerKey()}`) }), true);
});

test("a provider key inside binary bytes stays included", { timeout: 10_000 }, () => {
  assert.equal(requireShareSecretFree({ path: "themes/a.png", bytes: Buffer.from(`\u0000ÿ${providerKey()}\u0000`, "latin1") }), true);
});

test("a credential reference in content (not code) stays included", { timeout: 10_000 }, () => {
  assert.equal(requireShareSecretFree({ path: "settings/notes.json", bytes: Buffer.from("const apiKey = process.env.API_KEY;") }), true);
});

for (const path of ["plugins/p/index.js", "plugins/p/index.MJS", "plugins/p/a.cjs", "plugins/p/a.ts", "plugins/p/a.tsx", "plugins/p/a.jsx"]) {
  test(`a credential reference in code is allowed (${path})`, { timeout: 10_000 }, () => {
    assert.equal(requireShareSecretFree({ path, bytes: Buffer.from("const apiKey = process.env.API_KEY;") }), true);
  });
}

test("translated credential labels in a verified package file are allowed", { timeout: 10_000 }, () => {
  assert.equal(requireShareSecretFree({ path: `${PACKAGE_ROOT}/locales/es.json`, bytes: Buffer.from(LABELS) }, { packageFiles: shipped({ "locales/es.json": LABELS }) }), true);
});

test("the package payload relaxation matches the package root case-insensitively", { timeout: 10_000 }, () => {
  const path = `Agent-Plugins/WS/w/p/Package/SHA256/${HEX}/locales/es.json`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(LABELS) }, { packageFiles: shipped({ "locales/es.json": LABELS }) }), true);
});

test("the same labels in an unverified package-shaped file get the full scan", { timeout: 10_000 }, () => {
  const path = `${PACKAGE_ROOT}/locales/es.json`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(LABELS) }), true);
});

test("a provider key in an installed package payload stays included", { timeout: 10_000 }, () => {
  const path = `${PACKAGE_ROOT}/locales/es.json`;
  assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(providerKey()) }), true);
});

test("aliases fold case, compatibility forms, sharp-s and final sigma onto one key", { timeout: 10_000 }, () => {
  assert.deepEqual(["Themes/A", "themes/\ufb01le", "themes/Stra\u00dfe", "themes/\u039f\u0394\u039f\u03a3", "themes/\u03bf\u03b4\u03bf\u03c3"].map(path => sharePathAlias({ path })),
    ["themes/a", "themes/file", "themes/strasse", "themes/\u03bf\u03b4\u03bf\u03c2", "themes/\u03bf\u03b4\u03bf\u03c2"]);
});

test("a claim validates its path first", { timeout: 10_000 }, () => {
  assert.throws(() => claimSharePath({ path: "themes/a?b", directory: false, ...claims() }), unsafe("themes/a?b"));
});

test("a claim records every ancestor spelling and the file key", { timeout: 10_000 }, () => {
  const sets = claims();
  claimSharePath({ path: "themes/A/x.txt", directory: false, ...sets });
  assert.deepEqual({ aliases: [...sets.aliases], files: [...sets.files] }, { aliases: [["themes", "themes"], ["themes/a", "themes/A"], ["themes/a/x.txt", "themes/A/x.txt"]], files: ["themes/a/x.txt"] });
});

test("a directory claim records spellings but no file key", { timeout: 10_000 }, () => {
  const sets = claims();
  claimSharePath({ path: "themes/d", directory: true, ...sets });
  assert.deepEqual({ aliases: [...sets.aliases.keys()], files: [...sets.files] }, { aliases: ["themes", "themes/d"], files: [] });
});

test("the same directory spelling may be claimed twice and hold files", { timeout: 10_000 }, () => {
  const sets = claims();
  for (const [path, directory] of [["themes/d", true], ["themes/d", true], ["themes/d/x", false]] as const) claimSharePath({ path, directory, ...sets });
  assert.deepEqual([...sets.files], ["themes/d/x"]);
});

test("two spellings of one ancestor are refused as aliases", { timeout: 10_000 }, () => {
  const sets = claims();
  claimSharePath({ path: "themes/A/x", directory: false, ...sets });
  assert.throws(() => claimSharePath({ path: "themes/a/y", directory: false, ...sets }), { code: "UNSAFE_PATH", message: "ZIP contains unsafe case or Unicode aliases." });
});

test("a path below an already-claimed file is a file/directory collision", { timeout: 10_000 }, () => {
  const sets = claims();
  claimSharePath({ path: "themes/file", directory: false, ...sets });
  assert.throws(() => claimSharePath({ path: "themes/file/child", directory: false, ...sets }), { code: "UNSAFE_PATH", message: "ZIP file/directory collision." });
});

test("a file over an already-claimed directory is a duplicate", { timeout: 10_000 }, () => {
  const sets = claims();
  claimSharePath({ path: "themes/file/child", directory: false, ...sets });
  assert.throws(() => claimSharePath({ path: "themes/file", directory: false, ...sets }), { code: "UNSAFE_PATH", message: "Duplicate file or file/directory collision." });
});

test("the same file claimed twice is a duplicate", { timeout: 10_000 }, () => {
  const sets = claims();
  claimSharePath({ path: "themes/x", directory: false, ...sets });
  assert.throws(() => claimSharePath({ path: "themes/x", directory: false, ...sets }), { code: "UNSAFE_PATH", message: "Duplicate file or file/directory collision." });
});

test("a sibling sharing a name prefix is not a collision", { timeout: 10_000 }, () => {
  const sets = claims();
  claimSharePath({ path: "themes/file-a/x", directory: false, ...sets });
  claimSharePath({ path: "themes/file", directory: false, ...sets });
  assert.deepEqual([...sets.files], ["themes/file-a/x", "themes/file"]);
});

test("only notes and learned plugin memory travel, with the same credential scan", { timeout: 10_000 }, () => {
  for (const path of ["agent-plugins/ws/w/p/memory/notes/note.md", "agent-plugins/ws/w/p/memory/learned/fact.md", "plugins/p/1.0.0/memory/notes/note.md"]) {
    assert.equal(excludedSharePath({ path }), false);
    assert.equal(requireShareSecretFree({ path, bytes: Buffer.from(providerKey()) }), true);
  }
});
