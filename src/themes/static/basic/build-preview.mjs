#!/usr/bin/env node
// Stand-in for Tovu's real `static`-tier theme loader (not wired into
// src/features/theme/theme.ts yet). Stitches nav/footer slots + both token sets into
// standalone HTML under preview/<mode>/, mirroring what the host renderer will do:
// read tokens.json + tokens.light.json, emit :root and :root[data-theme="light"],
// resolve data-tovu-slot markers against the theme's declared partials. Every output
// page ships BOTH token sets and the live toggle — <mode> only controls the page's
// initial data-theme, not which tokens are available. Re-run after editing nav.html,
// footer.html, pages/*.html, or either tokens file.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

function tokensToCss(darkTokens, lightTokens) {
  const darkLines = Object.entries(darkTokens).map(([k, v]) => `  ${k}: ${v};`);
  const lightLines = Object.entries(lightTokens).map(([k, v]) => `  ${k}: ${v};`);
  return (
    `:root {\n${darkLines.join("\n")}\n}\n` +
    `:root[data-theme="light"] {\n${lightLines.join("\n")}\n}`
  );
}

function resolveSlots(html, { navHtml, footerHtml, footerMinimalHtml }) {
  html = html.replace(
    /<div data-tovu-slot="nav"[^>]*data-nav-current="([^"]+)"[^>]*><\/div>/,
    (_m, current) => {
      // Mark the matching nav link with aria-current="page" — mirrors what the
      // original export did inline per-page; here it's derived from one shared
      // partial + the page's declared data-nav-current, not duplicated markup.
      const re = new RegExp(`(<a href="[^"]+" data-nav-id="${current}")(>)`);
      return navHtml.replace(re, '$1 aria-current="page"$2');
    }
  );
  html = html.replace(
    /<div data-tovu-slot="footer"( data-slot-variant="minimal")?[^>]*><\/div>/,
    (_m, minimal) => (minimal ? footerMinimalHtml : footerHtml)
  );
  return html;
}

function build(mode) {
  const outDir = join(ROOT, "preview", mode);
  // Clean first: this build only ever copies/writes files it currently knows about, so a file
  // removed from source (e.g. a deleted script) would otherwise linger here forever as a stale
  // orphan (this happened for real — js/typewriter.js survived two rebuilds after deletion).
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "css"), { recursive: true });
  mkdirSync(join(outDir, "js/vendor"), { recursive: true });

  const darkTokens = JSON.parse(readFileSync(join(ROOT, "tokens.json"), "utf8"));
  const lightTokens = JSON.parse(readFileSync(join(ROOT, "tokens.light.json"), "utf8"));
  const navHtml = readFileSync(join(ROOT, "nav.html"), "utf8");
  const footerHtml = readFileSync(join(ROOT, "footer.html"), "utf8");
  const footerMinimalHtml = readFileSync(join(ROOT, "footer-minimal.html"), "utf8");

  copyFileSync(join(ROOT, "css/styles.css"), join(outDir, "css/styles.css"));
  copyFileSync(join(ROOT, "js/main.js"), join(outDir, "js/main.js"));
  copyFileSync(join(ROOT, "js/theme-toggle.js"), join(outDir, "js/theme-toggle.js"));
  copyFileSync(join(ROOT, "js/reveal.js"), join(outDir, "js/reveal.js"));
  copyFileSync(join(ROOT, "js/hero-intro.js"), join(outDir, "js/hero-intro.js"));
  copyFileSync(join(ROOT, "js/vendor/motion.js"), join(outDir, "js/vendor/motion.js"));

  const tokenCss = tokensToCss(darkTokens, lightTokens);
  const pagesDir = join(ROOT, "pages");
  const pages = readdirSync(pagesDir).filter((f) => f.endsWith(".html"));

  for (const file of pages) {
    let html = readFileSync(join(pagesDir, file), "utf8");
    if (mode === "light") html = html.replace("<html lang=\"en\">", "<html lang=\"en\" data-theme=\"light\">");
    html = html.replace('<link rel="stylesheet" href="../css/styles.css" />', () =>
      `<style>\n${tokenCss}\n</style>\n<link rel="stylesheet" href="css/styles.css" />`
    );
    html = html.replace('<script src="../js/theme-toggle.js"></script>', '<script src="js/theme-toggle.js"></script>');
    html = html.replace('<script src="../js/main.js"></script>', '<script src="js/main.js"></script>');
    html = html.replace('<script src="../js/vendor/motion.js"></script>', '<script src="js/vendor/motion.js"></script>');
    html = html.replace('<script src="../js/reveal.js"></script>', '<script src="js/reveal.js"></script>');
    html = html.replace('<script src="../js/hero-intro.js"></script>', '<script src="js/hero-intro.js"></script>');
    html = resolveSlots(html, { navHtml, footerHtml, footerMinimalHtml });
    writeFileSync(join(outDir, file), html);
  }
  console.log(`built ${pages.length} pages -> ${outDir} (initial mode: ${mode}, toggle live in both)`);
}

build("dark");
build("light");
