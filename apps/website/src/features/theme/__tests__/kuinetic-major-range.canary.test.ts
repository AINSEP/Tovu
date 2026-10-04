import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../../../../..");

function htmlFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(file);
    return entry.isFile() && entry.name.endsWith(".html") ? [file] : [];
  });
}

// Owner rule (09-27, reconfirmed 10-04): major range + local fallback. This must inspect live
// and __original-themes__ copies: fixing only the live tree reintroduces pins on reinstall.
test("shipping and site themes use kUInetic's major range with a local fallback", () => {
  const requiredRoots = ["content/themes", "sites/tovu-dev/themes"];
  const optionalRoots = ["apps/website/src/sites", "apps/website/sites"];
  const roots = [...requiredRoots, ...optionalRoots.filter((directory) => fs.existsSync(path.join(ROOT, directory)))];
  let cdnScripts = 0;
  let cdnPreloads = 0;
  for (const directory of roots) {
    for (const file of htmlFiles(path.join(ROOT, directory))) {
      // Comments and <pre>/<code> blocks are not loads. The kuinetic-showcase page prints install
      // snippets as escaped `&lt;script src="…/npm/kuinetic/dist/…"&gt;` text inside <pre><code>.
      const markup = fs.readFileSync(file, "utf8")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<pre\b[\s\S]*?<\/pre>/gi, "")
        .replace(/<code\b[\s\S]*?<\/code>/gi, "");
      const urls = [...markup.matchAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/kuinetic(?:@([^/"'\s<>]+))?\/dist\/[^"'\s<>]+/g)];
      for (const match of urls) {
        assert.equal(match[1], "0", `${path.relative(ROOT, file)}: use kuinetic@0, never an exact pin or latest tag`);
      }
      const script = /<script\b[^>]*src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/kuinetic@0\/dist\//i.test(markup);
      const preload = /<link\b[^>]*href=["']https:\/\/cdn\.jsdelivr\.net\/npm\/kuinetic@0\/dist\//i.test(markup);
      if (preload) cdnPreloads++;
      if (!script) continue;
      cdnScripts++;
      assert.match(markup, /window\.kuinetic\s*\|\|\s*document\.write\(/, `${file}: keep the offline fallback guard`);
      assert.match(markup, /src=["'][^"']*scripts\/vendor\/kuinetic\.all\.js/, `${file}: keep the local vendored script`);
    }
  }
  assert.ok(cdnScripts > 0, "must inspect real CDN scripts, not an empty theme set");
  assert.ok(cdnPreloads > 0, "must inspect preloads too, so the preload and runtime URL stay consistent");
});
