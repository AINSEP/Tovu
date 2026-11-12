// Per app/package roll-up of every check → breakdown.tsv; also args.tsv from the args-object audit JSON.
import fs from "node:fs";
const D = "/home/user/Tovu/development/cloud/quality-1111/static";
const tsv = (f) => { const [h, ...r] = fs.readFileSync(`${D}/${f}`, "utf8").trimEnd().split("\n"); const k = h.split("\t"); return r.map((l) => Object.fromEntries(l.split("\t").map((v, i) => [k[i], v]))); };
const unit = (repo, f) => { const p = f.split("/"); if (repo === "jini") return p[0] === "packages" ? `packages/${p[1]}` : p[0];
  return p[0] === "apps" || p[0] === "packages" ? `${p[0]}/${p[1]}` : p[0]; };
const U = new Map(); const get = (r, f) => { const k = r + "\t" + unit(r, f); if (!U.has(k)) U.set(k, {}); return U.get(k); };
const inc = (o, k, n = 1) => (o[k] = (o[k] ?? 0) + n);
for (const r of ["tovu", "jini"]) for (const f of fs.readFileSync(`${D}/raw/files-${r}.txt`, "utf8").split("\n").filter(Boolean)) {
  const o = get(r, f); inc(o, "files"); inc(o, "lines", fs.readFileSync(`/home/user/${r === "tovu" ? "Tovu" : "Jini"}/${f}`, "utf8").split("\n").length); }
for (const x of tsv("complexity.tsv")) { const o = get(x.repo, x.file); inc(o, "cc>10"); if (+x.complexity > 15) inc(o, "cc>15"); if (+x.complexity > 25) inc(o, "cc>25"); }
for (const x of tsv("cognitive.tsv")) inc(get(x.repo, x.file), "cog>10");
for (const x of tsv("long-functions.tsv")) inc(get(x.repo, x.file), "fn>80");
for (const x of tsv("big-files.tsv")) inc(get(x.repo, x.file), "file>500");
for (const x of tsv("typesafety.tsv")) { const k = /any/.test(x.check) ? "any" : x.check === "non_null_bang" ? "nonNull" : /ts_/.test(x.check) ? "tsDirective" : x.check === "eslint_disable" ? "eslintDisable" : x.check === "await_import" ? "awaitImport" : "dynImportOther"; inc(get(x.repo, x.file), k); }
for (const x of tsv("raw/duplication-by-file.tsv")) inc(get(x.repo, x.file), "dupLines", +x.duplicated_lines);
for (const x of tsv("knip.tsv")) { if (x.in_scope !== "yes") continue; const k = { "unused-file": "knipFiles", exports: "knipExports", types: "knipTypes" }[x.category]; if (k) inc(get(x.repo, x.file), k); }
const args = [];
for (const [r, lab] of [["tovu", "Tovu"], ["jini", "Jini"]]) for (const x of JSON.parse(fs.readFileSync(`${D}/raw/args-${lab}.json`, "utf8"))) {
  args.push([r, x.file, x.name, x.line, x.kind, x.n, x.exported === true || typeof x.exported === "number" ? "yes" : "no", x.why ?? ""]);
  if (x.kind === "violation" && U.has(r + "\t" + unit(r, x.file))) inc(get(r, x.file), "argViol"); }
fs.writeFileSync(`${D}/args.tsv`, "repo\tfile\tfunction\tline\tkind\tparams\texported\twhy\n" + args.map((a) => a.join("\t")).join("\n") + "\n");
const cols = ["files", "lines", "cc>10", "cc>15", "cc>25", "cog>10", "fn>80", "file>500", "any", "nonNull", "tsDirective", "eslintDisable", "awaitImport", "dupLines", "knipFiles", "knipExports", "knipTypes", "argViol"];
const rows = [...U].map(([k, o]) => [k, ...cols.map((c) => o[c] ?? 0)]).sort((a, b) => a[0].localeCompare(b[0]));
fs.writeFileSync(`${D}/breakdown.tsv`, "repo\tunit\t" + cols.join("\t") + "\n" + rows.map((r) => r.join("\t")).join("\n") + "\n");
console.log(rows.length, "units;", args.length, "args rows");
