// Builds RESULTS.md from the TSV/JSON outputs in this folder.
import fs from "node:fs";
const D = "/home/user/Tovu/development/cloud/quality-1111/static";
const rd = (f) => fs.readFileSync(`${D}/${f}`, "utf8");
const tsv = (f) => { const [h, ...r] = rd(f).trimEnd().split("\n"); const k = h.split("\t"); return r.map((l) => Object.fromEntries(l.split("\t").map((v, i) => [k[i], v]))); };
const J = (f) => JSON.parse(rd(f));
const md = (head, rows) => `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n` + rows.map((r) => `| ${r.map((c) => String(c ?? "").replace(/\|/g, "\\|")).join(" | ")} |`).join("\n") + "\n";
const by = (rows, k, v) => rows.filter((x) => x[k] === v);
const cnt = (rows, f) => rows.filter(f).length;
const ast = Object.fromEntries(rd("raw/ast-metrics.txt").trim().split("\n").map((l) => { const j = JSON.parse(l); return [j.label, j]; }));
const cx = tsv("complexity.tsv"), cog = tsv("cognitive.tsv");
const cxRepoCfg = J("raw/complexity-tovu-summary.txt".replace(/^/, "")) ;
const dup = J("raw/duplication-summary.json"), dupRows = tsv("duplication.tsv");
const knip = tsv("knip.tsv");
const cyc = tsv("cycles.tsv"), cs = J("raw/cycles-summary.json");
const args = Object.fromEntries(["Tovu", "Jini"].map((l) => [l, rd(`raw/args-${l}.txt`)]));
const argNum = (l, re) => (re.exec(args[l]) ?? [])[1];
const tc = fs.readdirSync(`${D}/raw/type-coverage`).filter((f) => f.endsWith(".json")).map((f) => { let j = {}; try { j = J(`raw/type-coverage/${f}`); } catch { j = { error: "no JSON (see raw)" }; } return [f.replace(/\.json$/, ""), j]; });
const tcAgg = (pfx) => { const xs = tc.filter(([n, j]) => n.startsWith(pfx) && j.succeeded); const c = xs.reduce((a, [, j]) => a + j.correctCount, 0), t = xs.reduce((a, [, j]) => a + j.totalCount, 0); return t ? `${(100 * c / t).toFixed(2)}% (${t - c} of ${t} identifiers untyped/any, ${xs.length} targets)` : "n/a"; };
const ts = tsv("typesafety.tsv"); const tsc = (r, k) => cnt(ts, (x) => x.repo === r && x.check === k);
const kn = (r, cat, f = () => true) => cnt(knip, (x) => x.repo === r && x.category === cat && f(x));
const inS = (x) => x.in_scope === "yes";
const link = (x) => /^LINK/.test(x.note ?? "");
const cc = (r, t) => cnt(cx, (x) => x.repo === r && +x.complexity > t);
const lf = tsv("long-functions.tsv"), bf = tsv("big-files.tsv");
const T = [];
const row = (check, metric, t, j) => T.push([check, metric, t, j]);
row("1 Complexity", "functions with cyclomatic > 10 (uniform eslint config, all prod files)", cc("tovu", 10), cc("jini", 10));
row("1 Complexity", "… > 15", cc("tovu", 15), cc("jini", 15));
row("1 Complexity", "… > 25", cc("tovu", 25), cc("jini", 25));
row("1 Complexity", "max cyclomatic", Math.max(...by(cx, "repo", "tovu").map((x) => +x.complexity)), Math.max(...by(cx, "repo", "jini").map((x) => +x.complexity)));
row("1 Complexity", "Tovu `npm run complexity:strict` (repo config): >10 / >15 / >25 / max", `${cxRepoCfg.cyclomatic_gt10} / ${cxRepoCfg.gt15} / ${cxRepoCfg.gt25} / ${cxRepoCfg.max}`, "—");
row("1 Complexity", "sonarjs cognitive complexity > 10 (bonus)", cnt(cog, (x) => x.repo === "tovu"), cnt(cog, (x) => x.repo === "jini"));
row("2 Duplication", "prod lines scanned", dup.tovu.prodLines, dup.jini.prodLines);
row("2 Duplication", "duplicated lines (union per file) / %", `${dup.tovu.duplicatedLinesUnion} / ${dup.tovu.pct}%`, `${dup.jini.duplicatedLinesUnion} / ${dup.jini.pct}%`);
row("2 Duplication", "clone pairs within repo", dup.byKind["tovu-tovu"].clones, dup.byKind["jini-jini"].clones);
row("2 Duplication", "Tovu↔Jini clone pairs / lines", `${dup.byKind["tovu-jini"].clones} / ${dup.byKind["tovu-jini"].lines}`, "(same)");
row("2 Duplication", "jscpd combined total (both repos)", `${dup.overall.clones} clones, ${dup.overall.duplicatedLines} lines, ${dup.overall.percentage}%`, "(same)");
row("3 Dead code", "unused files (in scope / all knip)", `${kn("tovu", "unused-file", inS)} / ${kn("tovu", "unused-file")}`, `${kn("jini", "unused-file", inS)} / ${kn("jini", "unused-file")}`);
row("3 Dead code", "unused exports (in scope / all)", `${kn("tovu", "exports", inS)} / ${kn("tovu", "exports")}`, `${kn("jini", "exports", inS)} / ${kn("jini", "exports")}`);
row("3 Dead code", "unused exported types (in scope / all)", `${kn("tovu", "types", inS)} / ${kn("tovu", "types")}`, `${kn("jini", "types", inS)} / ${kn("jini", "types")}`);
row("3 Dead code", "unused dependencies (excl. link artifacts / all)", `${kn("tovu", "dependencies", (x) => !link(x))} / ${kn("tovu", "dependencies")}`, `${kn("jini", "dependencies")} / ${kn("jini", "dependencies")}`);
row("3 Dead code", "unused devDependencies (excl. link artifacts / all)", `${kn("tovu", "devDependencies", (x) => !link(x))} / ${kn("tovu", "devDependencies")}`, `${kn("jini", "devDependencies")} / ${kn("jini", "devDependencies")}`);
row("3 Dead code", "unused optionalPeerDependencies", kn("tovu", "optionalPeerDependencies"), kn("jini", "optionalPeerDependencies"));
row("3 Dead code", "unlisted deps (prod files / all) · unresolved imports · unused binaries · duplicate exports", `${kn("tovu", "unlisted", inS)} / ${kn("tovu", "unlisted")} · ${kn("tovu", "unresolved")} · ${kn("tovu", "binaries")} · ${kn("tovu", "duplicates")}`, `${kn("jini", "unlisted", inS)} / ${kn("jini", "unlisted")} · ${kn("jini", "unresolved")} · ${kn("jini", "binaries")} · ${kn("jini", "duplicates")}`);
const cp = (r) => cnt(cyc, (x) => x.repo === r && !/scc|pair/.test(x.kind));
const cpRt = (r) => cnt(cyc, (x) => x.repo === r && !/scc|pair/.test(x.kind) && x.edge_types === "runtime");
row("4 Cycles", "dependency-cruiser no-circular cycle paths (runtime-only edges)", `${cp("tovu")} (${cpRt("tovu")})`, `${cp("jini")} (${cpRt("jini")})`);
row("4 Cycles", "module SCCs / modules in SCCs (incl. `import type`)", `${cs.moduleScc.tovu.sccs} / ${cs.moduleScc.tovu.modulesInSccs}`, `${cs.moduleScc.jini.sccs} / ${cs.moduleScc.jini.modulesInSccs}`);
row("4 Cycles", "module SCCs using runtime imports only", `${cs.moduleScc.tovu.runtimeSccs} / ${cs.moduleScc.tovu.runtimeModulesInSccs}`, `${cs.moduleScc.jini.runtimeSccs} / ${cs.moduleScc.jini.runtimeModulesInSccs}`);
row("4 Cycles", "Jini cross-package SCCs (`@jini-ai/*` imports; all / runtime-only)", "—", `${cs.jiniPackageSccs.length} / ${cs.jiniPackageSccsRuntime.length} (${cs.jiniPackages} packages, ${cs.jiniPackageEdges} package edges)`);
row("4 Cycles", "Tovu feature↔feature SCCs (sizes; all / runtime-only) · mutual feature pairs", `[${cs.tovuFeatureSccs}] / [${cs.tovuFeatureSccsRuntime}] · ${cs.tovuFeaturePairs}`, "—");
for (const l of ["Tovu", "Jini"]) {}
row("5 Args rule", "functions audited / ok / unsure / VIOLATION (%)", `${argNum("Tovu", /functions (\d+)/)} / ${argNum("Tovu", /ok (\d+)/)} / ${argNum("Tovu", /unsure (\d+)/)} / ${argNum("Tovu", /VIOLATION (\d+ \([\d.]+%\))/)}`, `${argNum("Jini", /functions (\d+)/)} / ${argNum("Jini", /ok (\d+)/)} / ${argNum("Jini", /unsure (\d+)/)} / ${argNum("Jini", /VIOLATION (\d+ \([\d.]+%\))/)}`);
row("5 Args rule", "exported functions: violations (%)", argNum("Tovu", /exported: \d+ .*?VIOLATION (\d+ \([\d.]+%\))/), argNum("Jini", /exported: \d+ .*?VIOLATION (\d+ \([\d.]+%\))/));
row("5 Args rule", "functions with > 2 params", argNum("Tovu", />2 params: (\d+)/), argNum("Jini", />2 params: (\d+)/));
for (const [k, lab] of [["as_any", "`as any`"], ["colon_any", "`: any` annotations"], ["other_any", "other `any` (generics, unions, `any[]`)"], ["non_null_bang", "non-null `!`"], ["ts_ignore", "`@ts-ignore`"], ["ts_expect_error", "`@ts-expect-error`"], ["ts_nocheck", "`@ts-nocheck`"], ["eslint_disable", "`eslint-disable*` comments"]])
  row("6 Type safety", lab + " (AST count)", tsc("tovu", k), tsc("jini", k));
row("6 Type safety", "type-coverage@2 (weighted over targets)", tcAgg("tovu-"), tcAgg("jini-"));
row("7 Other", "semgrep (`quality:semgrep:test`)", "SKIPPED — semgrep binary not installed (ENV)", "no semgrep script");
row("7 Other", "`await import(` in prod code", tsc("tovu", "await_import"), tsc("jini", "await_import"));
row("7 Other", "other dynamic `import()` (not awaited directly)", tsc("tovu", "dynamic_import_other"), tsc("jini", "dynamic_import_other"));
row("7 Other", "files > 500 lines", cnt(bf, (x) => x.repo === "tovu"), cnt(bf, (x) => x.repo === "jini"));
row("7 Other", "functions > 80 lines (nested functions counted separately)", cnt(lf, (x) => x.repo === "tovu"), cnt(lf, (x) => x.repo === "jini"));
row("—", "prod files in scope", ast.tovu.files, ast.jini.files);

let o = `# Quality audit 2026-11-11 — STATIC (structure + code quality)\n\nReport only: no source, test or config file in either repo was changed. Tovu at \`${process.env.TOVU_SHA}\` (branch \`cloud/quality-1111\`), Jini at \`${process.env.JINI_SHA}\` (\`main\`). Scope: Tovu \`apps/ packages/ content/\`, Jini \`packages/*/src\`; tests, \`dist\`, \`node_modules\`, \`vendor\`, fixtures, \`*.d.ts\` and the versioned plugin bundles are excluded (file lists: \`raw/files-tovu.txt\`, \`raw/files-jini.txt\`, built by \`scripts/filelist.sh\`). Every number below is reproducible from \`scripts/\` + \`raw/\`.\n\n`;
o += `## Totals\n\n` + md(["check", "metric", "Tovu", "Jini"], T) + "\n";
o += fs.readFileSync(`${D}/scripts/results-notes.md`, "utf8") + "\n";
// per unit
const bd = tsv("breakdown.tsv"); const bk = Object.keys(bd[0]);
o += `## Per app / package\n\nFrom \`breakdown.tsv\` (cc = cyclomatic, cog = cognitive, any = all \`any\` keywords, tsDirective = ts-ignore/expect-error/nocheck, knip* = in-scope unused files/exports/types, argViol = argument-rule violations).\n\n` + md(bk, bd.map((x) => bk.map((k) => x[k]))) + "\n";
const argUnits = (l) => args[l].split("\n").filter((x) => /^\s{2}\S+\s+\d+ violations/.test(x)).map((x) => { const m = /^\s+(\S+)\s+(\d+) violations \/ (\d+) fns \(exported (\d+)\)/.exec(x); return [l, m[1], m[2], m[3], (100 * m[2] / m[3]).toFixed(1) + "%", m[4]]; });
o += `### Argument rule per app / package (from the audit script)\n\n` + md(["repo", "unit", "violations", "functions", "%", "exported violations"], [...argUnits("Tovu"), ...argUnits("Jini")]) + "\n";
o += `### type-coverage per target\n\n` + md(["target", "percent", "typed", "total", "note"], tc.map(([n, j]) => [n, j.percent ?? "—", j.correctCount ?? "", j.totalCount ?? "", j.error ? j.error.slice(0, 120) : ""])) + "\n";
// lists
const top = (rows, n = 50) => rows.slice(0, n);
o += `## 1. Cyclomatic complexity > 10 — all ${cx.length} functions (\`complexity.tsv\`)\n\n` + md(["repo", "file", "function", "line", "cc", "in Tovu complexity:strict"], cx.map((x) => [x.repo, x.file, x.function, x.line, x.complexity, x.in_tovu_complexity_strict])) + "\n";
o += `### Cognitive complexity > 10 — all ${cog.length} (\`cognitive.tsv\`)\n\n` + md(["repo", "file", "line", "cognitive"], cog.map((x) => [x.repo, x.file, x.line, x.cognitive])) + "\n";
o += `## 2. Duplication — top 50 of ${dupRows.length} clone pairs by lines (\`duplication.tsv\`)\n\n` + md(["kind", "lines", "tokens", "A", "B"], top(dupRows).map((x) => [x.kind, x.lines, x.tokens, `${x.repo_a}:${x.file_a}:${x.start_a}-${x.end_a}`, `${x.repo_b}:${x.file_b}:${x.start_b}-${x.end_b}`])) + "\n";
const tj = dupRows.filter((x) => x.kind === "tovu-jini");
o += `### Tovu↔Jini copies — top 50 of ${tj.length}\n\n` + md(["lines", "tokens", "Tovu", "Jini"], top(tj).map((x) => { const [t, j] = x.repo_a === "tovu" ? ["a", "b"] : ["b", "a"]; return [x.lines, x.tokens, `${x["file_" + t]}:${x["start_" + t]}-${x["end_" + t]}`, `${x["file_" + j]}:${x["start_" + j]}-${x["end_" + j]}`]; })) + "\n";
const dbf = tsv("raw/duplication-by-file.tsv");
o += `### Files with most duplicated lines — top 50 of ${dbf.length}\n\n` + md(["repo", "file", "duplicated lines"], top(dbf).map((x) => [x.repo, x.file, x.duplicated_lines])) + "\n";
o += `## 3. Dead code (\`knip.tsv\`, ${knip.length} rows)\n\n`;
for (const r of ["tovu", "jini"]) {
  o += `### ${r}: unused files — all ${kn(r, "unused-file")}\n\n` + md(["file", "in scope"], knip.filter((x) => x.repo === r && x.category === "unused-file").map((x) => [x.file, x.in_scope])) + "\n";
  o += `### ${r}: unused / unlisted / unresolved dependencies and binaries — all\n\n` + md(["category", "package.json or file", "name", "note"], knip.filter((x) => x.repo === r && /ependencies|unlisted|unresolved|binaries/.test(x.category)).map((x) => [x.category, x.file, x.name, x.note])) + "\n";
  for (const c of ["exports", "types", "duplicates"]) { const xs = knip.filter((x) => x.repo === r && x.category === c && inS(x)); o += `### ${r}: unused ${c} (in scope) — top 50 of ${xs.length}, by file\n\n` + md(["file", "name", "line"], top(xs).map((x) => [x.file, x.name, x.line])) + "\n"; }
}
o += `## 4. Import cycles — top 50 of ${cyc.length} rows (\`cycles.tsv\` lists every one)\n\nKinds: \`cycle-path\` = one dependency-cruiser \`no-circular\` violation path; \`module-scc\` = strongly-connected component of files; \`*-runtime\` = same with \`import type\` edges removed; \`feature-scc\`/\`feature-pair\` = Tovu \`apps/{website,admin}/src/features/<f>\` collapsed; \`package-*\` = Jini packages via \`@jini-ai/*\` specifiers.\n\n`;
const order = ["package-scc", "package-scc-runtime", "feature-scc-runtime", "feature-scc", "module-scc-runtime", "module-scc", "feature-pair"];
const cycSorted = [...cyc].sort((a, b) => { const ia = order.indexOf(a.kind), ib = order.indexOf(b.kind); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || +b.size - +a.size; });
o += md(["repo", "kind", "id / run", "size", "edge types", "members / path"], top(cycSorted).map((x) => [x.repo, x.kind, x.id_or_run, x.size, x.edge_types, x.members_or_path.length > 700 ? x.members_or_path.slice(0, 700) + " …(see cycles.tsv)" : x.members_or_path])) + "\n";
const ar = tsv("args.tsv").filter((x) => x.kind === "violation").sort((a, b) => +b.params - +a.params || (b.exported === "yes") - (a.exported === "yes"));
o += `## 5. Argument rule — top 50 of ${ar.length} violations by parameter count (\`args.tsv\` has all ${ar.length} violations + unsure rows)\n\n` + md(["repo", "file", "function", "line", "params", "exported", "why"], top(ar).map((x) => [x.repo, x.file, x.function, x.line, x.params, x.exported, x.why])) + "\n";
const tsByFile = {}; for (const x of ts) if (!/import/.test(x.check)) { const k = x.repo + "\t" + x.file; tsByFile[k] ??= { any: 0, bang: 0, dir: 0, dis: 0 }; const o2 = tsByFile[k]; if (/any/.test(x.check)) o2.any++; else if (x.check === "non_null_bang") o2.bang++; else if (x.check === "eslint_disable") o2.dis++; else o2.dir++; }
const tsTop = Object.entries(tsByFile).map(([k, v]) => [...k.split("\t"), v.any, v.bang, v.dir, v.dis, v.any + v.bang + v.dir + v.dis]).sort((a, b) => b[6] - a[6]);
o += `## 6. Type-safety escapes — top 50 of ${tsTop.length} files (\`typesafety.tsv\` lists every hit with line)\n\n` + md(["repo", "file", "any", "non-null !", "ts-ignore/expect-error/nocheck", "eslint-disable", "total"], top(tsTop)) + "\n";
const anyRows = ts.filter((x) => /any|ts_/.test(x.check));
o += `### Every \`any\` / \`@ts-*\` directive hit (${anyRows.length})\n\n` + md(["repo", "check", "file", "line"], anyRows.map((x) => [x.repo, x.check, x.file, x.line])) + "\n";
const ai = ts.filter((x) => x.check === "await_import");
o += `## 7. Other\n\n### \`await import(\` in prod code — all ${ai.length}\n\n` + md(["repo", "file", "line"], ai.map((x) => [x.repo, x.file, x.line])) + "\n";
o += `### Files > 500 lines — top 50 of ${bf.length} (\`big-files.tsv\`)\n\n` + md(["repo", "file", "lines"], top(bf).map((x) => [x.repo, x.file, x.lines])) + "\n";
o += `### Functions > 80 lines — top 50 of ${lf.length} (\`long-functions.tsv\`)\n\n` + md(["repo", "file", "function", "line", "lines"], top(lf).map((x) => [x.repo, x.file, x.function, x.line, x.lines])) + "\n";
fs.writeFileSync(`${D}/RESULTS.md`, o); console.log("RESULTS.md", o.length, "chars");
