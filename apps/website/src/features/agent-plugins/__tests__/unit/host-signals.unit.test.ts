/** V06: synchronous shipped-data reader, including every refusal/failure seam, without activation. */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseHostSignalDeclaration, readBundledHostSignalDeclaration, resolveBundledHostSignals } from "../../host-signals.js";
import { CORE_HOST_SIGNAL_FALLBACK } from "#src/contracts/core/host-signals";

const signal = { env: "EXAMPLE_APP", facts: { hosted: true, nativeToolsRestricted: true, trustProxyHops: 1 }, label: "Example host" };
const manifest = (hostSignals: unknown, deploymentAdvice?: unknown) => ({ extensions: { tovu: { hostSignals, deploymentAdvice } } });
const empty = { hosted: false, nativeToolsRestricted: false, trustProxyHops: undefined, labels: [] };
const fallback = { ...empty, deploymentAdvice: "Set TOVU_RUNTIME_MODE=production (fly.toml and docker-compose.yml already do)." };

test("strict JSON declaration validation accepts only the data contract", () => {
  assert.deepEqual(parseHostSignalDeclaration({ manifest: manifest([signal], "Set example mode.") }), {
    signals: [signal], deploymentAdvice: "Set example mode.",
  });
  assert.deepEqual(parseHostSignalDeclaration({ manifest: manifest([{ env: "EMPTY", facts: {} }]) }), { signals: [{ env: "EMPTY", facts: {} }] });
  assert.deepEqual(parseHostSignalDeclaration({ manifest: manifest([{ env: "FALSE", facts: { hosted: false, nativeToolsRestricted: false } }]) }), {
    signals: [{ env: "FALSE", facts: { hosted: false, nativeToolsRestricted: false } }],
  });
  for (const value of [null, [], 1, {}, { extensions: null }, { extensions: [] }, { extensions: { tovu: null } },
    { extensions: { tovu: [] } }, manifest(null), manifest({}), manifest([null]), manifest([[]]),
    manifest([{ ...signal, env: 1 }]), manifest([{ ...signal, env: "bad name" }]), manifest([{ ...signal, env: "" }]),
    manifest([{ ...signal, facts: null }]), manifest([{ ...signal, facts: [] }]),
    ...[{ hosted: "true" }, { nativeToolsRestricted: 1 }, { unknown: true }, { trustProxyHops: "1" },
      { trustProxyHops: 0 }, { trustProxyHops: -1 }, { trustProxyHops: 1.5 }, { trustProxyHops: Infinity }, { trustProxyHops: Number.MAX_SAFE_INTEGER + 1 }]
      .map(facts => manifest([{ ...signal, facts }])),
    ...[null, false, "", "  ", "line\nbreak", "\u0000", "x".repeat(2049)].map(label => manifest([{ ...signal, label }])),
    ...[null, 12, "", "bad\rline"].map(advice => manifest([signal], advice)),
  ]) assert.equal(parseHostSignalDeclaration({ manifest: value }), undefined, JSON.stringify(value));
});

test("nonthrowing reader rejects ambiguous declarations as a whole for the core fallback", () => {
  const files: Record<string, string> = {
    good: JSON.stringify(manifest([signal, { env: "ONLY_HERE", facts: { nativeToolsRestricted: true } }], "Same advice")),
    duplicate: JSON.stringify(manifest([{ env: signal.env, facts: { hosted: false } }], "Same advice")),
    invalid: "{",
    absent: "{}",
    malformed: JSON.stringify(manifest([signal, { env: "BAD", facts: { hosted: "true" } }])),
  };
  const sourceRequests: unknown[] = [];
  const readPaths: string[] = [];
  const result = readBundledHostSignalDeclaration({ sourceRoot: "/shipped" }, {
    sources: required => {
      sourceRequests.push(required);
      return [...Object.keys(files), "unreadable"].map(pluginId => ({ pluginId, packageRoot: `/shipped/${pluginId}` }));
    },
    readText: file => {
      readPaths.push(file);
      const text = files[path.basename(path.dirname(file))];
      if (text === undefined) throw new Error("unreadable manifest");
      return text;
    },
  });
  assert.deepEqual(sourceRequests, [{ sourceRoot: "/shipped", filename: "plugin.json" }]);
  assert.deepEqual(readPaths, [...Object.keys(files), "unreadable"].map(name => `/shipped/${name}/plugin.json`));
  assert.deepEqual(result, { signals: [] });
  assert.deepEqual(readBundledHostSignalDeclaration({ sourceRoot: "/missing" }, { sources: () => { throw new Error("missing root"); } }), { signals: [] });
  assert.deepEqual(readBundledHostSignalDeclaration({ sourceRoot: "/empty" }, { sources: () => [] }), { signals: [] });
});

test("conflicting advice and duplicate names within one package yield no hints", () => {
  const result = readBundledHostSignalDeclaration({ sourceRoot: "/shipped" }, {
    sources: () => [{ pluginId: "one", packageRoot: "/one" }, { pluginId: "two", packageRoot: "/two" }],
    readText: file => JSON.stringify(manifest([signal, signal], file)),
  });
  assert.deepEqual(result, { signals: [] });
});

test("root discovery and read/evaluation failures never fail boot; supplied roots bypass discovery", () => {
  const input = { env: { EXAMPLE_APP: "private-value" } };
  assert.deepEqual(resolveBundledHostSignals(input, { productRoot: () => { throw new Error("no product root"); } }), fallback);
  assert.deepEqual(resolveBundledHostSignals(input, { sourceRoot: "/trusted", readDeclaration: () => { throw new Error("I/O failed"); } }), fallback);
  let reads = 0;
  const roots: string[] = [];
  const ports = {
    productRoot: () => "/product",
    readDeclaration: ({ sourceRoot }: { sourceRoot: string }) => {
      reads++;
      roots.push(sourceRoot);
      return { signals: [...CORE_HOST_SIGNAL_FALLBACK.signals, signal] };
    },
  };
  assert.deepEqual(resolveBundledHostSignals(input, ports), { hosted: true, nativeToolsRestricted: true, trustProxyHops: 1, labels: ["Example host"] });
  assert.equal(reads, 1);
  assert.deepEqual(roots, [path.join("/product", "content", "agent-plugins")]);
  let discoveries = 0;
  const suppliedRoots: string[] = [];
  assert.deepEqual(resolveBundledHostSignals(input, {
    sourceRoot: "/payload", productRoot: () => { discoveries++; return "/wrong-root"; },
    readDeclaration: required => { suppliedRoots.push(required.sourceRoot); return { signals: [] }; },
  }), fallback);
  assert.equal(discoveries, 0, "explicit root must win");
  assert.deepEqual(suppliedRoots, ["/payload"]);
});

test("real synchronous bundled selection reads manifests, excludes retired/non-packages, needs no activation", t => {
  const sourceRoot = mkdtempSync(path.join(os.tmpdir(), "host-signals-"));
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  for (const name of ["example-host", "deploy", "not-a-package", "malformed"]) mkdirSync(path.join(sourceRoot, name));
  writeFileSync(path.join(sourceRoot, "example-host", "plugin.json"), JSON.stringify(manifest([signal])));
  writeFileSync(path.join(sourceRoot, "deploy", "plugin.json"), JSON.stringify(manifest([{ env: "RETIRED", facts: { hosted: true } }])));
  writeFileSync(path.join(sourceRoot, "malformed", "plugin.json"), "{");
  writeFileSync(path.join(sourceRoot, "ordinary-file"), "not a directory");
  assert.deepEqual(readBundledHostSignalDeclaration({ sourceRoot }), { signals: [signal] });
  // An unrelated valid declaration cannot mask a missing baseline security declaration.
  assert.deepEqual(resolveBundledHostSignals({ env: { EXAMPLE_APP: "app" } }, { sourceRoot }), fallback);
  // Exercise the text port separately from the production default reader.
  assert.deepEqual(readBundledHostSignalDeclaration({ sourceRoot }, { readText: file => readFileSync(file, "utf8") }), { signals: [signal] });
});

test("default product-root binding reads shipped data without changing independent no-signal defaults", () => {
  assert.deepEqual(resolveBundledHostSignals({ env: {} }).labels, []);
});
