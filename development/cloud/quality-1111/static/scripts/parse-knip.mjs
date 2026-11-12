// knip JSON → knip.tsv (repo, category, file, name, line, in_scope) + counts.
// in_scope = prod path per the brief (Tovu apps/ packages/ content/; Jini packages/*/src), not a test file.
import fs from "node:fs";
const D = "/home/user/Tovu/development/cloud/quality-1111/static";
const TEST = /(^|\/)(__tests__|__mocks__|__fixtures__|fixtures|test|tests|e2e|vendor|dist)\/|\.(test|spec|typecheck|stories)\.|\.test-support\./;
const scope = { tovu: (f) => /^(apps|packages|content)\//.test(f) && !TEST.test(f), jini: (f) => /^packages\/[^/]+\/src\//.test(f) && !TEST.test(f) };
const rows = []; const out = {};
for (const r of ["tovu", "jini"]) {
  let txt = fs.readFileSync(`${D}/raw/knip-${r}.json`, "utf8"); txt = txt.slice(txt.indexOf("{"));
  const j = JSON.parse(txt);
  for (const f of j.files ?? []) rows.push([r, "unused-file", f, "", "", scope[r](f) ? "yes" : "no"]);
  for (const is of j.issues) for (const [cat, v] of Object.entries(is)) {
    if (cat === "file" || cat === "owners") continue;
    const items = Array.isArray(v) ? v.map((x) => [x, ""]) : Object.entries(v ?? {}).flatMap(([cls, arr]) => arr.map((x) => [x, cls]));
    for (const [x, cls] of items) {
      const name = Array.isArray(x) ? x.map((y) => y.name).join(" = ") : (cls ? cls + "." : "") + x.name;
      const line = Array.isArray(x) ? x[0]?.line ?? "" : x.line ?? "";
      rows.push([r, cat, is.file, name, line, scope[r](is.file) ? "yes" : (cat.toLowerCase().includes("dependenc") || cat === "binaries" ? "pkg" : "no")]);
    }
  }
  const c = {}; for (const x of rows.filter((x) => x[0] === r)) { const k = x[1]; c[k] ??= { all: 0, inScope: 0 }; c[k].all++; if (x[5] !== "no") c[k].inScope++; }
  out[r] = c;
}
fs.writeFileSync(`${D}/knip.tsv`, "repo\tcategory\tfile\tname\tline\tin_scope\n" + rows.map((x) => x.join("\t")).join("\n") + "\n");
fs.writeFileSync(`${D}/raw/knip-summary.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 0));
