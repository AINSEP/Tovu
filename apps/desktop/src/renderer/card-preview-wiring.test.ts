/**
 * @file The card preview's wiring, checked as source text — this repo has no DOM runner for `.tsx`
 * (see `use-add-site.hooks.test.ts`'s own header). The hook's own fetch/refetch behaviour is not
 * asserted here at all: `useSitePreview` calls React's `useEffect`, which needs a real render to
 * exercise, so what this file can and does check is narrower — that `SiteCard` actually calls the
 * hook and renders its result, and that a neutral placeholder stands in when it does not.
 *
 * Every assertion runs against COMMENT-STRIPPED source, same discipline `site-card-menu-wiring.test.ts`
 * uses — this file's own doc comments discuss `previewVersion`, `<img>` and the placeholder by
 * name, and a naive substring match would pass on the prose instead of the code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const gridSource = fs.readFileSync(path.join(here, "SiteGrid.tsx"), "utf8");
const grid = withoutComments(gridSource);

/** `SiteCard`'s own body, so a match cannot be satisfied by a sibling component. */
function cardBody() {
  const start = grid.indexOf("function SiteCard(");
  assert.notEqual(start, -1, "SiteCard is gone");
  const rest = grid.slice(start + 1);
  const end = rest.indexOf("\nfunction ");
  return end === -1 ? rest : rest.slice(0, end);
}

test("SiteCard imports and calls useSitePreview with the project's own id and previewVersion", () => {
  assert.match(grid, /import \{ useSitePreview \} from '\.\/use-site-preview\.hooks\.js'/);
  // The hook is an injectable prop (`SiteGrid.jsdom.test.ts` renders a capture through it) whose
  // default is the real `useSitePreview`, so production still calls the bridge-backed hook.
  assert.match(cardBody(), /usePreview = useSitePreview,/);
  assert.match(cardBody(), /usePreview\(\{ id: project\.id, previewVersion: project\.previewVersion \}\)/);
});

// REGRESSION: owner 2026-10-13 — "where it says 3000" there should be a preview, never the port.
test("the tile renders the capture when one exists, and a neutral placeholder otherwise — never the port", () => {
  const body = cardBody();
  assert.match(body, /previewUrl \? \(/, "expected a previewUrl-gated branch inside the tile");
  assert.match(body, /<img className="card__preview" src=\{previewUrl\} alt="" \/>/);
  assert.match(body, /<svg className="card__placeholder"[^>]*aria-hidden="true">/);
  assert.doesNotMatch(body, /card__port|portLabel/, "the tile must not fall back to the port");
});

test("the preview image carries no alt text — it is decoration, not content", () => {
  // An empty alt is deliberate here (not a missing one): a screen-reader user already has the
  // card's own name and status text right below the tile, and announcing "image" or a fabricated
  // description of a screenshot the operator cannot act on would be noise, not information.
  assert.match(cardBody(), /<img className="card__preview" src=\{previewUrl\} alt="" \/>/);
});
