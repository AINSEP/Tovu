// Builds /tmp/canary-inputs/<batch>/ from the dossier at /tmp/dossier: the batch's files.jsonl
// (rows of the listed paths, tier taken from batches.json so the split matches the local plan)
// plus every cross-file record that mentions one of those paths.
import fs from "node:fs";
const D = process.env.DOSSIER ?? "/tmp/dossier", OUT = process.env.OUT ?? "/tmp/canary-inputs";
const plan = JSON.parse(fs.readFileSync(new URL("./batches.json", import.meta.url), "utf8"));
const rows = new Map();
for (const f of fs.readdirSync(`${D}/batches`)) for (const l of fs.readFileSync(`${D}/batches/${f}`, "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l); rows.set(r.path, r); }
const cross = ["twins","port-edges","format-couplings","legacy-twins","jini-rules","composition-drift","module-twins","wire-drift","tool-calls"];
const data = Object.fromEntries(cross.map(c => [c, fs.existsSync(`${D}/${c}.jsonl`) ? fs.readFileSync(`${D}/${c}.jsonl`, "utf8").split("\n").filter(Boolean) : []]));
fs.mkdirSync(OUT, { recursive: true }); fs.copyFileSync(`${D}/summary.md`, `${OUT}/dossier-summary.md`);
for (const b of plan) {
  const o = `${OUT}/${b.batch}`; fs.mkdirSync(o, { recursive: true });
  const missing = [];
  const lines = b.files.map(f => { const r = rows.get(f.path); if (!r) missing.push(f.path); return JSON.stringify({ ...(r ?? { path: f.path, loc: f.loc }), tier: f.tier }); });
  fs.writeFileSync(`${o}/files.jsonl`, lines.join("\n") + "\n");
  for (const c of cross) fs.writeFileSync(`${o}/${c}.jsonl`, data[c].filter(l => b.files.some(f => l.includes(f.path))).join("\n"));
  console.log(b.batch, b.files.length, "files", missing.length ? `MISSING ${missing.length}: ${missing.join(", ")}` : "");
}
