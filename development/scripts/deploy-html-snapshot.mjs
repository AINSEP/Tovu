/**
 * P2 deploy guard (adopted 2026-10-12). Node 20+ (the runner's preinstalled Node), no dependencies.
 * node development/scripts/deploy-html-snapshot.mjs snapshot https://tovu.dev before.json
 * node development/scripts/deploy-html-snapshot.mjs compare before.json after.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const FIXED_PATHS = ["/", "/terms-of-service", "/privacy-policy", "/docs"];
const TAGS = ["svg", "script", "button", "video", "img", "a"];
const GUARDED_TAGS = ["svg", "script", "video", "img"];

/**
 * Measure UTF-8 HTML source, ignoring comments and markup inside raw-text elements.
 * This counts source tags, not a browser DOM or dynamically inserted elements.
 * @param {{html: string, status: number}} input
 * @returns {{status: number, bytes: number, counts: Record<string, number>}}
 * @example inspectHtml({ html: "<svg></svg>", status: 200 })
 * @complexity O(n) time and O(n) worst-case regex space for n source characters.
 */
export function inspectHtml({ html, status }, options = {}) {
  const counts = Object.fromEntries(TAGS.map((tag) => [tag, 0]));
  // Consume quoted attributes and raw-text bodies as a unit so embedded examples aren't tags.
  const tokens = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title|xmp|iframe|noembed|noframes)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>(?:[\s\S]*?<\/\1\s*>|[\s\S]*$)|<([a-z][a-z0-9:-]*)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  for (const match of html.matchAll(tokens)) {
    const tag = (match[1] ?? match[2] ?? "").toLowerCase();
    if (Object.hasOwn(counts, tag)) counts[tag] += 1;
  }
  return { status, bytes: Buffer.byteLength(html, "utf8"), counts };
}

/**
 * Select fixed Tovu paths and up to ten distinct same-origin sitemap URLs in order.
 * XML URL entities are decoded; fragments and duplicate locations are ignored.
 * @param {{baseUrl: string, sitemap: string}} input
 * @returns {string[]} Paths including query strings. Invalid base URLs throw TypeError.
 * @example selectPaths({ baseUrl: "https://tovu.dev", sitemap: "" })
 * @complexity O(n) time for n sitemap characters; at most 14 paths retained.
 */
export function selectPaths({ baseUrl, sitemap }, options = {}) {
  const base = new URL(baseUrl);
  const paths = new Set(FIXED_PATHS);
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  for (const match of sitemap.matchAll(/<loc\b[^>]*>([^<]*)<\/loc\s*>/gi)) {
    const location = match[1].trim().replace(/&(amp|lt|gt|quot|apos);/g,
      (_, entity) => entities[entity]);
    if (!URL.canParse(location, base)) continue;
    const url = new URL(location, base);
    if (url.origin !== base.origin) continue;
    paths.add(url.pathname + url.search);
    if (paths.size === FIXED_PATHS.length + 10) break;
  }
  return [...paths];
}

/**
 * Return every regression. Pages absent from `after` are skipped: sitemap order isn't stable
 * across deploys, so the extra paths can differ; the four fixed paths are always compared.
 * Strict thresholds allow exactly 50% tag loss and exactly 20% byte loss.
 * @param {{before: {pages: object}, after: {pages: object}}} input
 * @returns {{page: string, metric: string, before: number|string, after: number|string}[]}
 * @example compareSnapshots({ before: { pages: {} }, after: { pages: {} } })
 * @complexity O(p) time and space for p baseline pages; six metrics per page.
 */
export function compareSnapshots({ before, after }, options = {}) {
  const failures = [];
  for (const [page, previous] of Object.entries(before.pages)) {
    const current = after.pages[page];
    if (!current) continue;
    failures.push(...comparePage({ page, previous, current }));
  }
  return failures;
}

function comparePage({ page, previous, current }, _options = {}) {
  const failures = [];
  if (previous.status === 200 && current.status !== 200) {
    failures.push({ page, metric: "status", before: previous.status, after: current.status });
  }
  if (current.bytes < previous.bytes * 0.8) {
    failures.push({ page, metric: "bytes", before: previous.bytes, after: current.bytes });
  }
  for (const tag of GUARDED_TAGS) {
    if (previous.counts[tag] > 0 && current.counts[tag] < previous.counts[tag] * 0.5) {
      failures.push({ page, metric: tag, before: previous.counts[tag], after: current.counts[tag] });
    }
  }
  return failures;
}

/**
 * Fetch one resource with a 15-second deadline covering headers and body.
 * Transport failures become status 0, preserving evidence for compare and artifact upload.
 * @param {{url: string|URL}} input
 * @param {{fetchImpl?: typeof fetch}} options Injectable HTTP port.
 * @returns {Promise<{status: number, html: string, error?: string}>}
 */
async function fetchResource({ url }, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(15_000), headers: { "Cache-Control": "no-cache" },
    });
    return { status: response.status, html: await response.text() };
  } catch (error) {
    return { status: 0, html: "", error: error.message };
  }
}

/**
 * Capture at most 14 pages, with one additional sitemap request. Logs fetch failures.
 * Sitemap failure falls back to fixed paths; failed pages remain in the JSON as status 0.
 * @param {{baseUrl: string}} input
 * @param {{fetchImpl?: typeof fetch, logger?: Console}} options Explicit HTTP/logging ports.
 * @returns {Promise<{baseUrl: string, pages: object}>} Invalid base URLs throw TypeError.
 * @complexity O(b) time and space for b total HTML bytes; at most 15 sequential requests.
 */
export async function snapshot({ baseUrl }, { fetchImpl = globalThis.fetch, logger = console } = {}) {
  const base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol)) throw new TypeError("Expected an HTTP(S) base URL");
  const sitemap = await fetchResource({ url: new URL("/sitemap.xml", base) }, { fetchImpl });
  if (sitemap.status !== 200) logger.warn(`Sitemap unavailable (${sitemap.status}); using fixed paths`);
  const paths = selectPaths({ baseUrl, sitemap: sitemap.status === 200 ? sitemap.html : "" });
  const pages = {};
  for (const path of paths) {
    // Concatenate the checked origin so a pathname beginning // stays on this host.
    const result = await fetchResource({ url: new URL(base.origin + path) }, { fetchImpl });
    pages[path] = inspectHtml(result);
    if (result.error) pages[path].error = result.error;
    logger.log(`${path}: HTTP ${result.status}, ${pages[path].bytes} bytes${result.error ? ` (${result.error})` : ""}`);
  }
  return { baseUrl: base.origin, pages };
}

/** CLI effect boundary: write snapshots or print comparison results; failures exit 1. */
async function main({ args }, options = {}) {
  const [command, first, second, ...extra] = args;
  if (!first || !second || extra.length || !["snapshot", "compare"].includes(command)) {
    throw new TypeError("Usage: deploy-html-snapshot.mjs snapshot <baseUrl> <outFile> | compare <before> <after>");
  }
  if (command === "snapshot") {
    const result = await snapshot({ baseUrl: first });
    await writeFile(second, JSON.stringify(result, null, 2) + "\n");
    console.log(`Saved ${Object.keys(result.pages).length} pages to ${second}`);
    return;
  }
  const before = JSON.parse(await readFile(first, "utf8"));
  const after = JSON.parse(await readFile(second, "utf8"));
  const failures = compareSnapshots({ before, after });
  if (failures.length) {
    console.error(`HTML regression detected: ${failures.length} failing metrics`);
    console.table(failures);
    process.exitCode = 1;
  } else {
    console.log(`HTML guard passed: ${Object.keys(before.pages).length} baseline pages compared`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main({ args: process.argv.slice(2) }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
