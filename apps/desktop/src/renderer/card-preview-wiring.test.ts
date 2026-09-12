/**
 * @file The card preview's wiring, checked as source text — this repo has no DOM runner for `.tsx`
 * (see `use-add-site.hooks.test.ts`'s own header). The hook's own fetch/refetch behaviour is not
 * asserted here at all: `useSitePreview` calls React's `useEffect`, which needs a real render to
 * exercise, so what this file can and does check is narrower — that `SiteCard` actually calls the
 * hook and renders its result, and that the existing port fallback still exists for when it does not.
 *
 * Every assertion runs against COMMENT-STRIPPED source, same discipline `site-card-menu-wiring.test.js`
 * uses — this file's own doc comments discuss `previewVersion`, `<img>` and the port fallback by
 * name, and a naive substring match would pass on the prose instead of the code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function withoutComments(source) {
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
  assert.match(cardBody(), /useSitePreview\(project\.id, project\.previewVersion\)/);
});

test("the tile renders the capture when one exists, and the port tile otherwise — never both, never neither", () => {
  const body = cardBody();
  assert.match(body, /previewUrl \? \(/, "expected a previewUrl-gated branch inside the tile");
  assert.match(body, /<img className="card__preview" src=\{previewUrl\} alt="" \/>/);
  assert.match(body, /<span className="card__port">\{project\.port\}<\/span>/, "the port fallback must still exist");
});

test("the preview image carries no alt text — it is decoration, not content", () => {
  // An empty alt is deliberate here (not a missing one): a screen-reader user already has the
  // card's own name and status text right below the tile, and announcing "image" or a fabricated
  // description of a screenshot the operator cannot act on would be noise, not information.
  assert.match(cardBody(), /<img className="card__preview" src=\{previewUrl\} alt="" \/>/);
});
